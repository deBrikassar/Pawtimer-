const pad = (value) => String(value).padStart(2, "0");

export const toDateInputValue = (value) => {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};

export const toTimeInputValue = (value) => {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

export const buildEditedActivityIso = (dateValue, timeValue) => {
  const [year, month, day] = String(dateValue || "").split("-").map(Number);
  const [hours, minutes] = String(timeValue || "").split(":").map(Number);
  if (
    !Number.isInteger(year)
    || !Number.isInteger(month)
    || !Number.isInteger(day)
    || !Number.isInteger(hours)
    || !Number.isInteger(minutes)
  ) {
    return null;
  }

  const nextDate = new Date(year, month - 1, day, hours, minutes, 0, 0);
  if (
    Number.isNaN(nextDate.getTime())
    || nextDate.getFullYear() !== year
    || nextDate.getMonth() !== month - 1
    || nextDate.getDate() !== day
    || nextDate.getHours() !== hours
    || nextDate.getMinutes() !== minutes
  ) {
    return null;
  }

  return nextDate.toISOString();
};

const toTimestamp = (value) => {
  if (value == null || value === "") return Number.POSITIVE_INFINITY;
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : Number.POSITIVE_INFINITY;
};

export const sortByDateAsc = (items = []) => ensureArray(items)
  .map((item, index) => ({ item, index }))
  .sort((a, b) => {
    const byDate = toTimestamp(a.item?.date) - toTimestamp(b.item?.date);
    if (byDate !== 0) return byDate;
    return a.index - b.index;
  })
  .map(({ item }) => item);

function ensureArray(value) {
  return Array.isArray(value) ? value : [];
}
