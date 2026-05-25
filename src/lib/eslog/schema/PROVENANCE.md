# Vendored e-SLOG 2.0 schema — provenance

These files are the **official** e-SLOG 2.0 invoice schema, unmodified, vendored
from the e-SLOG 2.0 (August 2020) documentation package published by the
Slovenian national eBusiness centre (ePOS / GZS):

- Source: <https://www.epos.si/eslog> → `e-SLOG-2.0-08-2020-EN.zip`
- `eSLOG20_INVOIC_v200.xsd` — invoice (eRačun) XML schema, namespace `urn:eslog:2.00`.
- `xmldsig-core-schema.xsd` — W3C XML-Signature schema imported by the above
  (`http://www.w3.org/2000/09/xmldsig#`).

They are used at runtime by `../validate-eslog.ts` to validate produced e-SLOG
XML. The official sample invoice from the same package is kept (as a test
fixture) at `src/test/sample-eslog20-with-bt.xml`, and the 1.6↔2.0 mapping
tables ship in the package as `.xlsx` (not vendored here).

e-SLOG is an open standard for Slovenian electronic business documents; these
schema files are redistributed for interoperability. They are not covered by
this project's MIT license — refer to ePOS/GZS for their terms.
