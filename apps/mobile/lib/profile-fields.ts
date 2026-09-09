export const GENDERS = [
  { value: "woman", label: "Woman" }, { value: "man", label: "Man" },
  { value: "non_binary", label: "Non-binary" }, { value: "self_describe", label: "Self-describe" },
  { value: "prefer_not_to_say", label: "Prefer not to say" },
] as const;
export type Gender = typeof GENDERS[number]["value"];
export interface Profile {
  user_id: string; display_name: string | null; gender: Gender | null; gender_custom: string | null;
  phone: string | null; avatar_path: string | null; onboarding_completed_at: string | null;
}
export interface ProfileFields { name: string; gender: string; genderCustom: string; phone: string; avatarPath: string | null }
export function normalizePhone(value: string): string | null {
  const phone = value.trim().replace(/[\s().-]/g, "");
  if (!phone) return null;
  if (!/^\+[1-9]\d{6,14}$/.test(phone)) throw new Error("Include the country code, for example +91 98765 43210.");
  return phone;
}
export function validateProfile(fields: ProfileFields) {
  const name = fields.name.trim();
  if (!name || name.length > 80) throw new Error("Enter your name (up to 80 characters).");
  if (!GENDERS.some((g) => g.value === fields.gender)) throw new Error("Choose a gender option.");
  if (fields.gender === "self_describe" && (!fields.genderCustom.trim() || fields.genderCustom.trim().length > 80)) throw new Error("Describe your gender (up to 80 characters).");
  if (!fields.avatarPath) throw new Error("Add a profile photo to continue.");
  return { display_name: name, gender: fields.gender as Gender,
    gender_custom: fields.gender === "self_describe" ? fields.genderCustom.trim() : null,
    phone: normalizePhone(fields.phone), avatar_path: fields.avatarPath };
}
export const profileComplete = (profile: Profile | null | undefined) => !!(profile?.onboarding_completed_at && profile.display_name && profile.gender && profile.avatar_path);
export const genderLabel = (profile: Profile) => profile.gender === "self_describe" ? profile.gender_custom : GENDERS.find((g) => g.value === profile.gender)?.label;
