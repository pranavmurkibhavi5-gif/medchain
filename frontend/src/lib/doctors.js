/**
 * Doctor directory helpers.
 *
 * Granting a doctor access from their profile is the same operation the
 * approve-a-request flow performs, minus the request: record the permission on
 * the contract, then re-seal every record key for that doctor and share the
 * health profile. It reuses the existing record-sharing code rather than
 * duplicating it, so there is one implementation of key sharing, not two.
 */

/** The specialisations offered in the picker. Free text is still accepted. */
export const SPECIALIZATIONS = [
  "Cardiologist",
  "Neurologist",
  "Dermatologist",
  "Orthopedic",
  "Pediatrician",
  "Psychiatrist",
  "General Physician",
  "Gynecologist",
  "Oncologist",
  "ENT Specialist",
  "Ophthalmologist",
  "Dentist",
];

/** An emoji per specialisation, purely to make a long list scannable. */
const ICONS = {
  Cardiologist: "❤️",
  Neurologist: "🧠",
  Dermatologist: "🧴",
  Orthopedic: "🦴",
  Pediatrician: "🧒",
  Psychiatrist: "🫂",
  "General Physician": "🩺",
  Gynecologist: "🤰",
  Oncologist: "🎗️",
  "ENT Specialist": "👂",
  Ophthalmologist: "👁️",
  Dentist: "🦷",
};

export const iconFor = (specialization) => ICONS[specialization] || "🩺";

/** "12" -> "12 years", 0 or blank -> "". Keeps the card honest when unset. */
export function experienceLabel(years, t) {
  const n = Number(years || 0);
  if (!n) return "";
  return t("doctor.yearsExperience", { n });
}

/** Split a stored expertise list, which may be an array or comma-separated. */
export function expertiseList(value) {
  if (Array.isArray(value)) return value.filter(Boolean);
  return String(value || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}
