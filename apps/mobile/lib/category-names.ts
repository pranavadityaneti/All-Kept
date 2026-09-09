/** Short labels are for compact UI; the descriptive values remain the classifier/storage contract. */
const LABELS: Record<string, string> = {
  "Food & recipes": "Food",
  "Fitness & health": "Wellness",
  "Travel & places": "Travel",
  "Learning & how-to": "Learn",
  "Tech & tools": "Tech",
  "Money & career": "Career",
  "Design & inspiration": "Design",
  "Style & fashion": "Style",
  "Beauty & self-care": "Beauty",
  "Home & living": "Home",
  Entertainment: "Entertainment",
  "Humour & memes": "Memes",
  "News & opinion": "News",
  "Life & relationships": "Life",
  Other: "Other",

  // Old values can survive briefly in persisted queries while the migration and clients roll out.
  "Fashion & shopping": "Style",
  "Quotes & motivation": "Life",
  "People & personal": "Life",
};

export function categoryDisplayName(name: string): string {
  return LABELS[name] ?? name;
}
