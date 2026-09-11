export interface Profile {
  user_id: string; display_name: string | null;
  phone: string | null; avatar_path: string | null; onboarding_completed_at: string | null;
}
export interface ProfileFields { name: string; phone: string; avatarPath: string | null }
export function normalizePhone(value: string): string | null {
  const phone = value.trim().replace(/[\s().-]/g, "");
  if (!phone) return null;
  if (!/^\+[1-9]\d{6,14}$/.test(phone)) throw new Error("Include the country code, for example +91 98765 43210.");
  return phone;
}
export function validateProfile(fields: ProfileFields) {
  const name = fields.name.trim();
  if (!name || name.length > 80) throw new Error("Enter your name (up to 80 characters).");
  if (!fields.avatarPath) throw new Error("Add a profile photo to continue.");
  return { display_name: name, phone: normalizePhone(fields.phone), avatar_path: fields.avatarPath };
}
/**
 * Gender is not asked for and not stored.
 *
 * It was required at onboarding, with a free-text self-describe option — which under the GDPR is
 * arguably special-category data, and consent for it was not freely given because the app could not
 * be used without answering. Nothing in Allkept ever read it: it sorted no saves and changed no
 * screen. The safest thing to hold is nothing, so the question is gone and the stored values with it.
 */
export const profileComplete = (profile: Profile | null | undefined) =>
  !!(profile?.onboarding_completed_at && profile.display_name && profile.avatar_path);
