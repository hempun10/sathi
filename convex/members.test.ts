/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api, internal } from "./_generated/api";
import {
  MAX_CLARIFICATION_CONSTRAINTS,
  MAX_CLARIFICATION_SUBJECT,
  MAX_CLARIFY_ROUNDS,
} from "./members";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

const step = (
  text: string,
  overrides: Partial<{
    tokenHash: string;
    claimExpiresAt: number;
    now: number;
    isOwner: boolean;
  }> = {},
) => ({
  senderKey: "sender-key-1",
  text,
  tokenHash: "token-hash-1",
  claimExpiresAt: 10_000,
  now: 1_000,
  ...overrides,
});

test("unknown sender is asked for a name and creates one member", async () => {
  const t = convexTest(schema, modules);
  const outcome = await t.mutation(internal.members.onboard, step("hello"));
  expect(outcome).toBe("asked_for_name");

  const members = await t.run((ctx) => ctx.db.query("members").collect());
  expect(members).toHaveLength(1);
  expect(members[0].onboardingState).toBe("awaiting_name");
});

test("a valid name activates the member and issues one claim", async () => {
  const t = convexTest(schema, modules);
  await t.mutation(internal.members.onboard, step("hello"));
  const outcome = await t.mutation(
    internal.members.onboard,
    step("  Ri\u0000ley  "),
  );
  expect(outcome).toBe("activated");

  const member = await t.run((ctx) =>
    ctx.db
      .query("members")
      .withIndex("by_sender_key", (q) => q.eq("senderKey", "sender-key-1"))
      .unique(),
  );
  expect(member?.displayName).toBe("Riley");
  expect(member?.onboardingState).toBe("active_unclaimed");

  const claims = await t.run((ctx) =>
    ctx.db.query("dashboardClaims").collect(),
  );
  expect(claims).toHaveLength(1);
});

test("settings issues a replacement claim without a second member", async () => {
  const t = convexTest(schema, modules);
  await t.mutation(internal.members.onboard, step("hello"));
  await t.mutation(internal.members.onboard, step("Riley"));
  const outcome = await t.mutation(
    internal.members.onboard,
    step(" Settings ", { tokenHash: "token-hash-2" }),
  );
  expect(outcome).toBe("settings_link");

  const members = await t.run((ctx) => ctx.db.query("members").collect());
  expect(members).toHaveLength(1);
  const claims = await t.run((ctx) =>
    ctx.db.query("dashboardClaims").collect(),
  );
  expect(claims).toHaveLength(2);
  expect(
    claims.find((claim) => claim.tokenHash === "token-hash-1")?.consumedAt,
  ).toBe(1_000);
  expect(
    await t.query(internal.members.claimForToken, {
      tokenHash: "token-hash-1",
      now: 1_000,
    }),
  ).toBeNull();
});

test("claim consumption links the member and rejects replay and expiry", async () => {
  const t = convexTest(schema, modules);
  await t.mutation(internal.members.onboard, step("hello"));
  await t.mutation(internal.members.onboard, step("Riley"));
  const userId = await t.run((ctx) =>
    ctx.db.insert("users", { name: "Riley" }),
  );

  const consumed = await t.mutation(internal.members.consumeClaim, {
    tokenHash: "token-hash-1",
    authUserId: userId,
    now: 2_000,
  });
  const member = await t.run((ctx) => ctx.db.get(consumed.memberId));
  expect(member?.onboardingState).toBe("active_claimed");
  expect(member?.authUserId).toBe(userId);

  await expect(
    t.mutation(internal.members.consumeClaim, {
      tokenHash: "token-hash-1",
      authUserId: userId,
      now: 2_000,
    }),
  ).rejects.toThrow();

  expect(
    await t.query(internal.members.claimForToken, {
      tokenHash: "token-hash-1",
      now: 2_000,
    }),
  ).toBeNull();

  await t.mutation(
    internal.members.onboard,
    step("settings", {
      tokenHash: "token-hash-expired",
      claimExpiresAt: 1_500,
    }),
  );
  await expect(
    t.mutation(internal.members.consumeClaim, {
      tokenHash: "token-hash-expired",
      authUserId: userId,
      now: 2_000,
    }),
  ).rejects.toThrow();
});

test("profile requires auth and maps the auth user to its member", async () => {
  const t = convexTest(schema, modules);
  expect(await t.query(api.members.profile)).toBeNull();

  await t.mutation(internal.members.onboard, step("hello"));
  await t.mutation(internal.members.onboard, step("Riley"));
  const userId = await t.run((ctx) =>
    ctx.db.insert("users", { name: "Riley" }),
  );
  await t.mutation(internal.members.consumeClaim, {
    tokenHash: "token-hash-1",
    authUserId: userId,
    now: 2_000,
  });

  const profile = await t
    .withIdentity({ subject: userId })
    .query(api.members.profile);
  expect(profile).toMatchObject({
    displayName: "Riley",
    onboardingState: "active_claimed",
    iMessageConnected: true,
  });
});

test("updateLocality stores a valid radius and rejects invalid ones", async () => {
  const t = convexTest(schema, modules);
  await t.mutation(internal.members.onboard, step("hello"));
  await t.mutation(internal.members.onboard, step("Riley"));
  const userId = await t.run((ctx) =>
    ctx.db.insert("users", { name: "Riley" }),
  );
  await t.mutation(internal.members.consumeClaim, {
    tokenHash: "token-hash-1",
    authUserId: userId,
    now: 2_000,
  });
  const asRiley = t.withIdentity({ subject: userId });

  await asRiley.mutation(api.members.updateLocality, {
    searchNearMe: true,
    searchRadiusMeters: 5_000,
    city: "Austin",
    countryCode: "us",
  });
  expect(await asRiley.query(api.members.profile)).toMatchObject({
    locality: {
      searchNearMe: true,
      searchRadiusMeters: 5_000,
      city: "Austin",
      countryCode: "US",
    },
  });

  for (const invalid of [
    99,
    100_001,
    150.5,
    -1,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    2 ** 53,
  ]) {
    await expect(
      asRiley.mutation(api.members.updateLocality, {
        searchNearMe: true,
        searchRadiusMeters: invalid,
      }),
    ).rejects.toThrow();
  }
});

// ---------------------------------------------------------------------------
// Bounded clarification state
// ---------------------------------------------------------------------------

process.env.OWNER_SENDER_KEY = "sender-key-1";

const seedOwnerMember = async (t: ReturnType<typeof convexTest>) => {
  await t.mutation(internal.members.onboard, step("hello"));
  await t.mutation(internal.members.onboard, step("Riley"));
};

test("saveClarification stores a bounded brief and a stale revision cannot overwrite it", async () => {
  const t = convexTest(schema, modules);
  await seedOwnerMember(t);

  const first = await t.mutation(internal.members.saveClarification, {
    senderKey: "sender-key-1",
    revision: 100,
    subject: "a jacket",
    constraints: "warm, black",
    missing: "size",
    now: 1_000,
  });
  expect(first.saved).toBe(true);

  const stale = await t.mutation(internal.members.saveClarification, {
    senderKey: "sender-key-1",
    revision: 50,
    subject: "stale",
    constraints: "stale",
    missing: "item",
    now: 2_000,
  });
  expect(stale.saved).toBe(false);

  const read = await t.query(internal.members.readClarification, {
    senderKey: "sender-key-1",
    now: 2_000,
  });
  expect(read.continuation).toMatchObject({
    subject: "a jacket",
    constraints: "warm, black",
    missing: "size",
  });
  expect(read.revision).toBe(100);
  expect(read.expired).toBe(false);
});

test("clarification writers enforce the owner key and bounds", async () => {
  const t = convexTest(schema, modules);
  await seedOwnerMember(t);

  expect(
    (
      await t.mutation(internal.members.saveClarification, {
        senderKey: "not-owner",
        revision: 100,
        subject: "x",
        constraints: "y",
        missing: "item",
        now: 1,
      })
    ).saved,
  ).toBe(false);
  expect(
    (
      await t.mutation(internal.members.saveClarification, {
        senderKey: "sender-key-1",
        revision: 100,
        subject: "x".repeat(MAX_CLARIFICATION_SUBJECT),
        constraints: "y".repeat(MAX_CLARIFICATION_CONSTRAINTS),
        missing: "item",
        now: 1,
      })
    ).saved,
  ).toBe(true);
  expect(
    (
      await t.mutation(internal.members.saveClarification, {
        senderKey: "sender-key-1",
        revision: 101,
        subject: "x".repeat(MAX_CLARIFICATION_SUBJECT + 1),
        constraints: "y",
        missing: "item",
        now: 1,
      })
    ).saved,
  ).toBe(false);
  expect(
    (
      await t.mutation(internal.members.saveClarification, {
        senderKey: "sender-key-1",
        revision: 102,
        subject: "x",
        constraints: "y".repeat(MAX_CLARIFICATION_CONSTRAINTS + 1),
        missing: "item",
        now: 1,
      })
    ).saved,
  ).toBe(false);
  expect(
    (
      await t.mutation(internal.members.saveClarification, {
        senderKey: "sender-key-1",
        revision: 100,
        subject: "a\nb",
        constraints: "y",
        missing: "item",
        now: 1,
      })
    ).saved,
  ).toBe(false);
  expect(
    (
      await t.mutation(internal.members.clearClarification, {
        senderKey: "not-owner",
        expectedRevision: 0,
        revision: 10,
        now: 1,
      })
    ).cleared,
  ).toBe(false);
});

test("clearClarification only clears the consumed revision and blocks a late save", async () => {
  const t = convexTest(schema, modules);
  await seedOwnerMember(t);
  await t.mutation(internal.members.saveClarification, {
    senderKey: "sender-key-1",
    revision: 100,
    subject: "a jacket",
    constraints: "warm",
    missing: "size",
    now: 1_000,
  });

  const wrong = await t.mutation(internal.members.clearClarification, {
    senderKey: "sender-key-1",
    expectedRevision: 99,
    revision: 200,
    now: 2_000,
  });
  expect(wrong.cleared).toBe(false);

  const cleared = await t.mutation(internal.members.clearClarification, {
    senderKey: "sender-key-1",
    expectedRevision: 100,
    revision: 200,
    now: 2_000,
  });
  expect(cleared.cleared).toBe(true);

  // A late action from the old chain must not overwrite the clear.
  const late = await t.mutation(internal.members.saveClarification, {
    senderKey: "sender-key-1",
    revision: 150,
    subject: "late",
    constraints: "late",
    missing: "item",
    now: 3_000,
  });
  expect(late.saved).toBe(false);

  const read = await t.query(internal.members.readClarification, {
    senderKey: "sender-key-1",
    now: 3_000,
  });
  expect(read.continuation).toBeNull();
  expect(read.revision).toBe(200);
});

test("an expired clarification is ignored and reported for opportunistic clearing", async () => {
  const t = convexTest(schema, modules);
  await seedOwnerMember(t);
  await t.mutation(internal.members.saveClarification, {
    senderKey: "sender-key-1",
    revision: 100,
    subject: "a jacket",
    constraints: "warm",
    missing: "size",
    now: 1_000,
  });

  const expired = await t.query(internal.members.readClarification, {
    senderKey: "sender-key-1",
    now: 1_000 + 10 * 60 * 1000 + 1,
  });
  expect(expired.continuation).toBeNull();
  expect(expired.expired).toBe(true);
  expect(expired.revision).toBe(100);
});

test("the owner texting the literal word settings is not hijacked into a link resend", async () => {
  const t = convexTest(schema, modules);
  await t.mutation(internal.members.onboard, step("hello"));
  await t.mutation(internal.members.onboard, step("Riley"));

  const outcome = await t.mutation(
    internal.members.onboard,
    step("settings", { isOwner: true }),
  );
  expect(outcome).toBe("holding");
});

test("a non-owner texting settings still gets a link resend", async () => {
  const t = convexTest(schema, modules);
  await t.mutation(internal.members.onboard, step("hello"));
  await t.mutation(internal.members.onboard, step("Riley"));

  const outcome = await t.mutation(internal.members.onboard, step("settings"));
  expect(outcome).toBe("settings_link");
});

test("saveClarification gives up and clears state past the round cap", async () => {
  const t = convexTest(schema, modules);
  await seedOwnerMember(t);

  let revision = 100;
  for (let round = 1; round <= MAX_CLARIFY_ROUNDS; round++) {
    const result = await t.mutation(internal.members.saveClarification, {
      senderKey: "sender-key-1",
      revision,
      subject: "a jacket",
      constraints: "warm",
      missing: "size",
      now: revision,
    });
    expect(result).toEqual({ saved: true });
    revision += 1;
  }

  const capped = await t.mutation(internal.members.saveClarification, {
    senderKey: "sender-key-1",
    revision,
    subject: "a jacket",
    constraints: "warm, still vague",
    missing: "size",
    now: revision,
  });
  expect(capped).toEqual({ saved: false, capped: true });

  const read = await t.query(internal.members.readClarification, {
    senderKey: "sender-key-1",
    now: revision,
  });
  expect(read.continuation).toBeNull();
});
