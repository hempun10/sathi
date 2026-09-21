/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

const step = (
  text: string,
  overrides: Partial<{
    tokenHash: string;
    claimExpiresAt: number;
    now: number;
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
