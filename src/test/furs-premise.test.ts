import { describe, expect, test } from "bun:test";
import * as v from "valibot";
import {
  buildBusinessPremiseRequest,
  FursBusinessPremise,
  FursMovableBusinessPremise,
  isFursMovableBusinessPremise,
} from "../lib/furs/messages";

const options = {
  messageId: "m1",
  headerIso: "2026-05-25T14:30:01",
  validityDateYmd: "2026-05-25",
};

const immovablePremise = {
  taxNumber: 10489185,
  premiseId: "BP101",
  cadastralNumber: 123,
  buildingNumber: 456,
  buildingSectionNumber: 7,
  street: "Glavna ulica",
  houseNumber: "12",
  houseNumberAdditional: "A",
  community: "Ljubljana",
  city: "Ljubljana",
  postalCode: "1000",
  validityDate: new Date("2026-05-25T00:00:00Z"),
  softwareSupplierTaxNumber: 87654321,
  specialNotes: "Open daily",
};

const movablePremise = {
  taxNumber: immovablePremise.taxNumber,
  premiseId: immovablePremise.premiseId,
  premiseType: "A" as const,
  validityDate: immovablePremise.validityDate,
  softwareSupplierTaxNumber: immovablePremise.softwareSupplierTaxNumber,
  specialNotes: immovablePremise.specialNotes,
};

describe("business premise registration", () => {
  test("keeps the immovable message byte-identical", () => {
    const message = buildBusinessPremiseRequest(immovablePremise, options);
    const expected = {
      BusinessPremiseRequest: {
        Header: {
          MessageID: "m1",
          DateTime: "2026-05-25T14:30:01",
        },
        BusinessPremise: {
          TaxNumber: 10489185,
          BusinessPremiseID: "BP101",
          BPIdentifier: {
            RealEstateBP: {
              PropertyID: {
                CadastralNumber: 123,
                BuildingNumber: 456,
                BuildingSectionNumber: 7,
              },
              Address: {
                Street: "Glavna ulica",
                HouseNumber: "12",
                Community: "Ljubljana",
                City: "Ljubljana",
                PostalCode: "1000",
                HouseNumberAdditional: "A",
              },
            },
          },
          ValidityDate: "2026-05-25",
          SoftwareSupplier: [{ TaxNumber: 87654321 }],
          SpecialNotes: "Open daily",
        },
      },
    };

    expect(message).toEqual(expected);
    expect(JSON.stringify(message)).toBe(JSON.stringify(expected));
  });

  test("emits only PremiseType for a movable premise", () => {
    const message = buildBusinessPremiseRequest(movablePremise, options) as any;
    const body = message.BusinessPremiseRequest.BusinessPremise;

    expect(isFursMovableBusinessPremise(movablePremise)).toBe(true);
    expect(isFursMovableBusinessPremise(immovablePremise)).toBe(false);
    expect(body.BPIdentifier).toEqual({ PremiseType: "A" });
    const serialized = JSON.stringify(message);
    expect(serialized).not.toContain("RealEstateBP");
    expect(serialized).not.toContain("Address");
    expect(serialized).not.toContain("PropertyID");
  });

  test("accepts premise types A, B and C and rejects a fourth letter", () => {
    for (const premiseType of ["A", "B", "C"] as const) {
      const premise = { ...movablePremise, premiseType };
      const parsed = v.safeParse(FursMovableBusinessPremise, premise);
      expect(parsed.success).toBe(true);
      const message = buildBusinessPremiseRequest(premise, options) as any;
      expect(message.BusinessPremiseRequest.BusinessPremise.BPIdentifier).toEqual({ PremiseType: premiseType });
    }

    const rejected = v.safeParse(FursMovableBusinessPremise, { ...movablePremise, premiseType: "D" });
    expect(rejected.success).toBe(false);
  });

  test("builds identical shared fields for immovable and movable premises", () => {
    const immovableBody = (buildBusinessPremiseRequest(immovablePremise, options) as any).BusinessPremiseRequest
      .BusinessPremise;
    const movableBody = (buildBusinessPremiseRequest(movablePremise, options) as any).BusinessPremiseRequest
      .BusinessPremise;

    expect({
      TaxNumber: movableBody.TaxNumber,
      BusinessPremiseID: movableBody.BusinessPremiseID,
      ValidityDate: movableBody.ValidityDate,
      SoftwareSupplier: movableBody.SoftwareSupplier,
      SpecialNotes: movableBody.SpecialNotes,
    }).toEqual({
      TaxNumber: immovableBody.TaxNumber,
      BusinessPremiseID: immovableBody.BusinessPremiseID,
      ValidityDate: immovableBody.ValidityDate,
      SoftwareSupplier: immovableBody.SoftwareSupplier,
      SpecialNotes: immovableBody.SpecialNotes,
    });
  });

  test("omits HouseNumberAdditional when it is empty on an immovable premise", () => {
    const premise = { ...immovablePremise, houseNumberAdditional: "" };
    const message = buildBusinessPremiseRequest(premise, options) as any;
    const address = message.BusinessPremiseRequest.BusinessPremise.BPIdentifier.RealEstateBP.Address;

    expect(address).toEqual({
      Street: "Glavna ulica",
      HouseNumber: "12",
      Community: "Ljubljana",
      City: "Ljubljana",
      PostalCode: "1000",
    });
    expect("HouseNumberAdditional" in address).toBe(false);
  });

  test("keeps the immovable schema separate from the movable shape", () => {
    expect(v.safeParse(FursBusinessPremise, immovablePremise).success).toBe(true);
    expect(v.safeParse(FursBusinessPremise, movablePremise).success).toBe(false);
  });

  test("omits SpecialNotes and SoftwareSupplier rather than sending them empty", () => {
    // FURS validates against a JSON schema with no room for an empty string and
    // answers S002, "Sporočilo ni v skladu s shemo JSON", naming no field.
    // Verified against the FURS test environment: the same registration returns
    // registered once these two members are absent instead of empty.
    const bare = buildBusinessPremiseRequest(
      { ...movablePremise, specialNotes: undefined, softwareSupplierTaxNumber: undefined },
      options,
    ) as { BusinessPremiseRequest: { BusinessPremise: Record<string, unknown> } };
    const premise = bare.BusinessPremiseRequest.BusinessPremise;
    expect(premise).not.toHaveProperty("SpecialNotes");
    expect(premise).not.toHaveProperty("SoftwareSupplier");

    // Whitespace is not content either.
    const blank = buildBusinessPremiseRequest(
      { ...movablePremise, specialNotes: "   ", softwareSupplierTaxNumber: undefined, foreignSoftwareSupplierName: "" },
      options,
    ) as { BusinessPremiseRequest: { BusinessPremise: Record<string, unknown> } };
    expect(blank.BusinessPremiseRequest.BusinessPremise).not.toHaveProperty("SpecialNotes");
    expect(blank.BusinessPremiseRequest.BusinessPremise).not.toHaveProperty("SoftwareSupplier");

    // A foreign supplier name with content still travels.
    const foreign = buildBusinessPremiseRequest(
      { ...movablePremise, softwareSupplierTaxNumber: undefined, foreignSoftwareSupplierName: "Grunt d.o.o." },
      options,
    ) as { BusinessPremiseRequest: { BusinessPremise: Record<string, unknown> } };
    expect(foreign.BusinessPremiseRequest.BusinessPremise.SoftwareSupplier).toEqual([
      { NameForeign: "Grunt d.o.o." },
    ]);
  });
});
