import { sortByDateAsc as sortByDateAscShared } from "./dateSort";

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

export const sortByDateAsc = (items = []) => sortByDateAscShared(items, {
  invalidPolicy: "push-to-end",
});
