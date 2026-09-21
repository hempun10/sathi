import { ConvexCredentials } from "@convex-dev/auth/providers/ConvexCredentials";
import {
  convexAuth,
  createAccount,
  retrieveAccount,
} from "@convex-dev/auth/server";
import { internal } from "./_generated/api";
import { hashClaimToken } from "./crypto";

const PROVIDER_ID = "imessage-claim";

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [
    ConvexCredentials({
      id: PROVIDER_ID,
      authorize: async (credentials, ctx) => {
        if (typeof credentials.token !== "string") {
          return null;
        }

        const tokenHash = await hashClaimToken(credentials.token);
        const now = Date.now();
        const claim = await ctx.runQuery(internal.members.claimForToken, {
          tokenHash,
          now,
        });
        if (claim === null) {
          return null;
        }

        const profile: Record<string, string> =
          claim.displayName === undefined ? {} : { name: claim.displayName };

        let userId = claim.authUserId;
        if (userId === undefined) {
          try {
            const created = await createAccount(ctx, {
              provider: PROVIDER_ID,
              account: { id: claim.memberId },
              profile,
            });
            userId = created.user._id;
          } catch (error) {
            const existing = await retrieveAccount(ctx, {
              provider: PROVIDER_ID,
              account: { id: claim.memberId },
            }).catch(() => {
              throw error;
            });
            userId = existing.user._id;
          }
        }

        await ctx.runMutation(internal.members.consumeClaim, {
          tokenHash,
          authUserId: userId,
          now,
        });
        return { userId };
      },
    }),
  ],
});
