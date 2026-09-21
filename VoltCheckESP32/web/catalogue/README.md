# Ather public vehicle catalogue

Snapshot date: 6 November 2026 (India client date).
Primary source: https://www.atherenergy.com/electric-scooter-all-models

Saved factual catalogue for future inspection-profile and certificate work. This is a current public-page snapshot, not a complete history of every Ather generation or a guarantee of ordering availability.

## Captured

- 3 families: Konarc, Rizta and 450.
- 7 model/trim names: Konarc S, Konarc Z, Rizta S, Rizta Z, 450S, 450X and 450 Apex.
- 12 records with manufacturer variant codes and detailed specification data.
- 3 separate announcement records: Konarc S 200 km IDC, Konarc Z 125 km IDC, Konarc Z 161 km IDC. These have no inferred battery-capacity mapping.
- 1,296 specification slots as provided by the page data, including 1,077 non-null values. Null template fields remain null, not false or zero.
- Product colour metadata where published, plus separately identified unpaired Konarc gallery colours.
- 13,510 city-price snapshot rows across four source pages. These overlap; they are NOT 13,510 distinct vehicles/prices. Each row keeps its original source and variant code.

## Files

- ather-catalogue.json: master catalogue, variant IDs/codes, complete captured specification rows, sources, timestamps, interpretation notes and unresolved source issues.
- ather-variants.csv: compact, readable variant list.
- ather-specifications.csv: one row per source variant/specification attribute. Category and null fields are retained.
- ather-city-prices.json / .csv: city-specific public embedded pricing snapshots. Fields are retained as published. Exact code matching is explicit; unmatched/older codes receive no guessed battery capacity.
- source-issues.json: ambiguity/version/conflict register.

## Important distinctions

1. The source calls these battery figures Installed capacity. They are not measured usable energy. Usable energy and this scooter's measured range remain null.
2. IDC and TrueRange are manufacturer reference claims. Neither becomes a range prediction from our ML model.
3. Current larger-pack labels in the captured 450/Rizta specifications are 3.5 kWh. Older official documents list 3.7 kWh. Keep older vehicles' actual identification documents and their model year; do not relabel a used scooter from a current web page.
4. Rizta's lower-range variant codes combine the capacity label 2.7 kWh / 2.9 kWh. The catalogue preserves that ambiguity; it does not invent two independently confirmed orderable codes.
5. Konarc Z is labelled coming soon on the product page. Konarc S 200 km appears as a headline but was not a separate row in the captured specification table. Missing capacities remain unknown.
6. Some connectivity/RideAssist features require AtherStack Pro or an active subscription. Warranty eligibility depends on the individual vehicle, invoice, policy, transfer terms and distance. Published terms do not prove remaining warranty.
7. A catalogue match does not establish CAN compatibility. The generic existing Rizta 2.9 kWh reference decoder remains the only assigned diagnostic profile in the station build.
8. Prices are date/city/options/subsidy/colour dependent. These records are reference snapshots, not quotations or guaranteed present-day offers.
9. Product facts and specifications were extracted; marketing prose, trackers, page scripts and image binaries are not included in this deliverable.

## Official source pages

https://www.atherenergy.com/electric-scooter-all-models
https://www.atherenergy.com/rizta
https://www.atherenergy.com/rizta/specifications
https://www.atherenergy.com/450
https://www.atherenergy.com/450/specifications
https://www.atherenergy.com/konarc
https://www.atherenergy.com/konarc/specifications

Legacy/version context:
https://media.atherenergy.com/Ather-Rizta-specifications.pdf
https://media.atherenergy.com/450-Apex-Specsheet-2.pdf

Source URLs, source-provided variant codes, publisher update dates (where present) and normalized-data fingerprints are kept in the JSON. The same catalogue is bundled with the station website so later work can read it from files instead of relying on chat memory.
