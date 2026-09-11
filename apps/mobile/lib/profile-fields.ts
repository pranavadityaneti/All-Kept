export interface Profile {
  user_id: string; display_name: string | null;
  avatar_path: string | null; onboarding_completed_at: string | null;
}
export interface ProfileFields { name: string; avatarPath: string | null }
export function validateProfile(fields: ProfileFields) {
  const name = fields.name.trim();
  if (!name || name.length > 80) throw new Error("Enter your name (up to 80 characters).");
  return { display_name: name, avatar_path: fields.avatarPath };
}
/**
 * Gender is not asked for and not stored.
 *
 * It was required at onboarding, with a free-text self-describe option — which under the GDPR is
 * arguably special-category data, and consent for it was not freely given because the app could not
 * be used without answering. Nothing in Allkept ever read it: it sorted no saves and changed no
 * screen. The safest thing to hold is nothing, so the question is gone and the stored values with it.
 *
 * The phone number went the same way on 11 September 2026: optional, never read by anything, and a
 * liability to hold. The profile photo stayed but became optional, set from Settings rather than
 * demanded at onboarding — a library does not need a face. Onboarding is complete once the server
 * has a name.
 */
export const profileComplete = (profile: Profile | null | undefined) =>
  !!(profile?.onboarding_completed_at && profile.display_name);
