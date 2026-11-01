# Data sources

Every table the puzzles query, where it came from, under what terms, and how the subset was
cut. The exact download URLs and SQL are in `scripts/fetch-data.ts`; that script is the
record, and this file explains it. Row counts and the retrieval date of the committed files
are in `public/data/sources.json`, written by the same script.

The sources are live datasets that change daily. Rerunning the fetch will not reproduce the
committed files byte for byte; the committed Parquet is what the puzzles are graded against.

## `inspections`

- **Source**: DOHMH New York City Restaurant Inspection Results, NYC Open Data,
  https://data.cityofnewyork.us/d/43nn-pn8j (Socrata API `resource/43nn-pn8j.csv`).
- **Terms**: published under the NYC Open Data Law (NYC Administrative Code Title 23,
  Chapter 5, https://codelibrary.amlegal.com/codes/newyorkcity/latest/NYCadmin/0-0-0-216807),
  which makes public data sets available without registration, license or restrictions on
  use. Attribution: NYC Department of Health and Mental Hygiene, via NYC Open Data.
- **Subset**: restaurants whose `camis` ends in 7 (about 10% of restaurants), with every row
  each of them has. The source keeps a rolling window of recent inspections.
- **Kept**: `camis, dba, boro, zipcode, cuisine_description, inspection_date, action,
  violation_code, violation_description, critical_flag, score, grade, grade_date,
  inspection_type`. Dates are cast to DATE, `score` to INTEGER; everything else is text as
  published.
- **Dropped**: building, street, phone, coordinates and the geographic codes. They are not
  needed for the puzzles and the phone column can be a personal number for small businesses.
- **Mess left in on purpose**: one row per violation with the score repeated (fan-out),
  31 exact duplicate rows, `boro = '0'`, `inspection_date = 1900-01-01` for restaurants
  not yet inspected, NULL cuisine and ZIP on those rows, grade codes N/P/Z next to A/B/C,
  chain names spelled many ways.

## `service_requests`

- **Source**: 311 Service Requests from 2020 to Present, NYC Open Data,
  https://data.cityofnewyork.us/d/erm2-nwe9 (Socrata API `resource/erm2-nwe9.csv`).
- **Terms**: NYC Open Data Law, as above. Attribution: NYC 311, via NYC Open Data.
- **Subset**: requests created in 2024 whose `unique_key` ends in 42 (about 1%, spread over
  the year).
- **Kept**: `unique_key, created_date, closed_date, agency, complaint_type, descriptor,
  location_type, incident_zip, city, status, resolution_action_updated_date,
  community_board, borough, open_data_channel_type`. Timestamps are New York local time
  with no zone, as published.
- **Dropped**: street addresses, cross streets, coordinates, BBL and precinct: a 311 address
  can identify someone's home.
- **Mess left in on purpose**: `borough = 'Unspecified'`, neighbourhood names in `city`,
  mixed casing in `complaint_type` (`HEAT/HOT WATER` next to `Noise - Residential`),
  open requests with NULL `closed_date`, a few closed before they were created, NULL ZIPs.

## `complaints`

- **Source**: Consumer Complaint Database, Consumer Financial Protection Bureau,
  https://www.consumerfinance.gov/data-research/consumer-complaints/ (search API, CSV).
- **Terms**: US federal government work; the API reports the license as CC0
  (https://creativecommons.org/publicdomain/zero/1.0/).
- **Subset**: product `Student loan`, received 2023-01-01 to 2024-12-31, every complaint.
- **Kept**: `complaint_id, date_received, product, sub_product, issue, sub_issue, company,
  state, submitted_via, date_sent_to_company, company_response, company_public_response,
  timely_response`, renamed to snake_case. Timestamps are UTC; the trailing `Z` is removed
  and they are stored as plain TIMESTAMP.
- **Dropped**: consumer ZIP code, tags (age and military status) and the narrative text.
  The CFPB already scrubs them, but none are needed and they describe individuals.
- **Mess left in on purpose**: the string `'None'` wherever a value is missing.

## `emissions`

- **Source**: Our World in Data, CO2 and Greenhouse Gas Emissions,
  https://github.com/owid/co2-data (`owid-co2-data.csv`).
- **Terms**: CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/). Attribution: Our World
  in Data. OWID notes that third-party data in the file keeps its original terms: the CO2
  columns come from the Global Carbon Project and GDP from the Maddison Project Database
  (both published under CC BY 4.0), population from OWID's own compilation. Check the
  codebook in that repository before reusing the columns elsewhere.
- **Subset**: years 1950 onward.
- **Kept**: `country, year, iso_code, population, gdp, co2, co2_per_capita, coal_co2,
  oil_co2, gas_co2, cement_co2`.
- **Mess left in on purpose**: regions, income groups and "(GCP)" aggregates in the same
  table as countries with NULL `iso_code`, Kosovo with no ISO code, GDP ending two years
  before emissions.

## `synthetic_grade_feed` (synthetic)

- **Made up.** Built by `scripts/fetch-data.ts` from the real `inspections` table, to show
  mess no public feed shows together.
- **What it is**: every A/B/C graded inspection since 2024, delivered as a vendor feed with
  `inspection_date_text` in four formats (`2025-03-05`, `03/05/2025`, `05 Mar 2025`,
  `20250305`), a `loaded_at` timestamp usually 1-3 days after the inspection and 20-60 days
  late for about 1 in 10, a second delivery for about 1 in 12 (plain re-send) and about 1 in
  33 (the first delivery had the wrong grade; the second corrects it). The two deliveries of
  one inspection use different date formats.
- **Determinism**: every choice is a function of `md5(camis || '|' || inspection_date)`, so the
  same inspections give the same feed.
- **Check**: keeping the latest delivery per inspection gives back exactly the grades in
  `inspections`.
