/**
 * Download the public datasets, cut the subsets and write public/data/*.parquet.
 *
 * Usage: npm run fetch-data [-- --refresh]
 *   Raw downloads are cached in data/raw/ (gitignored); --refresh downloads them again.
 *   Writes public/data/<table>.parquet and public/data/sources.json.
 *
 * The subsetting rules here are the record of what the committed Parquet contains. Sources
 * update daily, so a refetch can change puzzle answers: run `npm run fingerprints` after it.
 */
import fs from 'node:fs';
import path from 'node:path';
import { NodeDuckDB } from '../src/engine/node.ts';

const root = path.resolve(import.meta.dirname, '..');
const rawDir = path.join(root, 'data', 'raw');
const outDir = path.join(root, 'public', 'data');

const SODA = 'https://data.cityofnewyork.us/resource';
const CFPB = 'https://www.consumerfinance.gov/data-research/consumer-complaints/search/api/v1/';

function soda(dataset: string, params: Record<string, string>): string {
  return `${SODA}/${dataset}.csv?${new URLSearchParams(params).toString()}`;
}

const downloads: Record<string, string> = {
  'inspections.csv': soda('43nn-pn8j', {
    $select:
      'camis,dba,boro,zipcode,cuisine_description,inspection_date,action,violation_code,' +
      'violation_description,critical_flag,score,grade,grade_date,inspection_type',
    // Reason: about 10% of restaurants, keeping every row each one has, so per-restaurant history stays whole.
    $where: "camis like '%7'",
    $order: 'camis,inspection_date,violation_code',
    $limit: '200000',
  }),
  'service_requests.csv': soda('erm2-nwe9', {
    $select:
      'unique_key,created_date,closed_date,agency,complaint_type,descriptor,location_type,' +
      'incident_zip,city,status,resolution_action_updated_date,community_board,borough,' +
      'open_data_channel_type',
    // Reason: a 1% sample of 2024 spread over the whole year, picked by key suffix so it is reproducible.
    $where:
      "created_date between '2024-01-01T00:00:00' and '2024-12-31T23:59:59' and unique_key like '%42'",
    $order: 'unique_key',
    $limit: '200000',
  }),
  'complaints.csv': `${CFPB}?${new URLSearchParams({
    format: 'csv',
    no_aggs: 'true',
    product: 'Student loan',
    date_received_min: '2023-01-01',
    date_received_max: '2024-12-31',
  }).toString()}`,
  'emissions.csv': 'https://raw.githubusercontent.com/owid/co2-data/master/owid-co2-data.csv',
};

// Each statement reads data/raw/<name>.csv as text and casts deliberately, so placeholders
// such as 'None', '0' and 1900-01-01 survive exactly as the source publishes them.
const tables: Record<string, string> = {
  inspections: `
    SELECT CAST(camis AS INTEGER) AS camis, dba, boro, zipcode, cuisine_description,
           CAST(CAST(inspection_date AS TIMESTAMP) AS DATE) AS inspection_date,
           action, violation_code, violation_description, critical_flag,
           CAST(score AS INTEGER) AS score, grade,
           CAST(CAST(grade_date AS TIMESTAMP) AS DATE) AS grade_date, inspection_type
    FROM read_csv('inspections.csv', all_varchar = true)
    ORDER BY camis, inspection_date, violation_code`,
  service_requests: `
    SELECT CAST(unique_key AS BIGINT) AS unique_key,
           CAST(created_date AS TIMESTAMP) AS created_date,
           CAST(closed_date AS TIMESTAMP) AS closed_date,
           agency, complaint_type, descriptor, location_type, incident_zip, city, status,
           CAST(resolution_action_updated_date AS TIMESTAMP) AS resolution_action_updated_date,
           community_board, borough, open_data_channel_type
    FROM read_csv('service_requests.csv', all_varchar = true)
    ORDER BY unique_key`,
  complaints: `
    SELECT CAST("Complaint ID" AS BIGINT) AS complaint_id,
           CAST(rtrim("Date received", 'Z') AS TIMESTAMP) AS date_received,
           "Product" AS product, "Sub-product" AS sub_product, "Issue" AS issue,
           "Sub-issue" AS sub_issue, "Company" AS company, "State" AS state,
           "Submitted via" AS submitted_via,
           CAST(rtrim("Date sent to company", 'Z') AS TIMESTAMP) AS date_sent_to_company,
           "Company response to consumer" AS company_response,
           "Company public response" AS company_public_response,
           "Timely response?" AS timely_response
    FROM read_csv('complaints.csv', all_varchar = true)
    ORDER BY complaint_id`,
  emissions: `
    SELECT country, CAST(year AS INTEGER) AS year, iso_code,
           CAST(CAST(population AS DOUBLE) AS BIGINT) AS population,
           CAST(gdp AS DOUBLE) AS gdp, CAST(co2 AS DOUBLE) AS co2,
           CAST(co2_per_capita AS DOUBLE) AS co2_per_capita,
           CAST(coal_co2 AS DOUBLE) AS coal_co2, CAST(oil_co2 AS DOUBLE) AS oil_co2,
           CAST(gas_co2 AS DOUBLE) AS gas_co2, CAST(cement_co2 AS DOUBLE) AS cement_co2
    FROM read_csv('emissions.csv', all_varchar = true)
    WHERE CAST(year AS INTEGER) >= 1950
    ORDER BY country, year`,
};

// SYNTHETIC. Real graded inspections re-delivered the way a vendor feed might send them: dates
// in four text formats, some rows delivered twice, some delivered first with a wrong grade and
// corrected later, some loaded weeks late. Every choice is a function of md5(camis, date), so
// the table is the same on every run. It exists because no public feed shows these together.
const syntheticGradeFeed = `
  WITH graded AS (
    SELECT DISTINCT camis, inspection_date, grade
    FROM inspections
    WHERE grade IN ('A', 'B', 'C') AND inspection_date >= DATE '2024-01-01'
  ),
  keyed AS (
    SELECT *, CAST('0x' || substr(md5(camis || '|' || inspection_date), 1, 8) AS BIGINT) AS k
    FROM graded
  ),
  timed AS (
    -- first delivery: 1-3 days after the inspection for most rows, 20-60 days late for 1 in 10
    SELECT *,
           inspection_date
             + INTERVAL (CASE WHEN k % 10 = 0 THEN 20 + k % 41 ELSE 1 + k % 3 END) DAY
             + INTERVAL (k % 86400) SECOND AS first_loaded_at
    FROM keyed
  ),
  deliveries AS (
    -- about 1 in 33 first deliveries carry the wrong grade
    SELECT camis, inspection_date, k % 4 AS date_format, first_loaded_at AS loaded_at,
           CASE WHEN k % 33 = 0 THEN (CASE grade WHEN 'A' THEN 'B' ELSE 'A' END) ELSE grade END AS grade
    FROM timed
    UNION ALL
    -- second delivery, always after the first: the correction for those rows, and a plain
    -- re-send for about 1 in 12 others
    -- in the next date format along, so the two rows for one inspection do not match as text
    SELECT camis, inspection_date, (k + 1) % 4 AS date_format,
           first_loaded_at + INTERVAL (1 + k % 20) DAY + INTERVAL (k % 7200) SECOND AS loaded_at,
           grade
    FROM timed
    WHERE k % 33 = 0 OR k % 12 = 0
  )
  SELECT CAST(row_number() OVER (ORDER BY loaded_at, camis, inspection_date) AS INTEGER) AS feed_row_id,
         camis,
         CASE date_format
           WHEN 0 THEN strftime(inspection_date, '%Y-%m-%d')
           WHEN 1 THEN strftime(inspection_date, '%m/%d/%Y')
           WHEN 2 THEN strftime(inspection_date, '%d %b %Y')
           ELSE strftime(inspection_date, '%Y%m%d')
         END AS inspection_date_text,
         grade,
         CAST(loaded_at AS TIMESTAMP) AS loaded_at
  FROM deliveries
  ORDER BY feed_row_id`;

async function download(name: string, url: string, refresh: boolean): Promise<void> {
  const target = path.join(rawDir, name);
  if (fs.existsSync(target) && !refresh) {
    console.log(`cached   ${name}`);
    return;
  }
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Download failed for ${name}: HTTP ${response.status} from ${url}`);
  }
  fs.writeFileSync(target, Buffer.from(await response.arrayBuffer()));
  console.log(`fetched  ${name}`);
}

async function main(): Promise<void> {
  const refresh = process.argv.includes('--refresh');
  fs.mkdirSync(rawDir, { recursive: true });
  fs.mkdirSync(outDir, { recursive: true });
  await Promise.all(Object.entries(downloads).map(([name, url]) => download(name, url, refresh)));

  const db = await NodeDuckDB.create();
  for (const name of Object.keys(downloads)) db.registerFile(name, path.join(rawDir, name));

  const all = { ...tables, synthetic_grade_feed: syntheticGradeFeed };
  const manifest: Record<string, { rows: number; bytes: number }> = {};
  for (const [table, sql] of Object.entries(all)) {
    db.querySync(`CREATE OR REPLACE TABLE ${table} AS ${sql}`);
    const target = path.join(outDir, `${table}.parquet`);
    // Reason: under Node, DuckDB-WASM writes straight to the real file system, and it cannot
    // replace an existing file (it writes tmp_<name> and the rename fails), so clear it first.
    fs.rmSync(target, { force: true });
    db.querySync(`COPY ${table} TO '${target}' (FORMAT parquet, COMPRESSION zstd)`);
    const [count] = db.querySync(`SELECT count(*) AS n FROM ${table}`);
    manifest[table] = { rows: Number(count?.n), bytes: fs.statSync(target).size };
    console.log(
      `wrote    ${table}.parquet  ${manifest[table].rows} rows  ${manifest[table].bytes} bytes`,
    );
  }

  const retrievedAt = new Date(
    Math.min(...Object.keys(downloads).map((n) => fs.statSync(path.join(rawDir, n)).mtimeMs)),
  )
    .toISOString()
    .slice(0, 10);
  fs.writeFileSync(
    path.join(outDir, 'sources.json'),
    JSON.stringify({ retrieved_at: retrievedAt, tables: manifest }, null, 2) + '\n',
  );
  console.log(`wrote    sources.json (retrieved ${retrievedAt})`);
}

await main();
