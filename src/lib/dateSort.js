const INVALID_DATE_POLICIES = {
  DROP: "drop",
  PUSH_TO_END: "push-to-end",
};

const toTimestampOrNull = (value) => {
  if (value == null || value === "") return null;
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : null;
};

const ensureArray = (value) => (Array.isArray(value) ? value : []);

export const sortByDateAsc = (items = [], options = {}) => {
  const invalidPolicy = options.invalidPolicy || INVALID_DATE_POLICIES.PUSH_TO_END;
  const mapped = ensureArray(items)
    .map((item, index) => ({ item, index, timestamp: toTimestampOrNull(item?.date) }));

  if (invalidPolicy === INVALID_DATE_POLICIES.DROP) {
    return mapped
      .filter((entry) => entry.timestamp != null)
      .sort((a, b) => {
        const byDate = a.timestamp - b.timestamp;
        if (byDate !== 0) return byDate;
        return a.index - b.index;
      })
      .map(({ item }) => item);
  }

  return mapped
    .sort((a, b) => {
      const timeA = a.timestamp == null ? Number.POSITIVE_INFINITY : a.timestamp;
      const timeB = b.timestamp == null ? Number.POSITIVE_INFINITY : b.timestamp;
      const byDate = timeA - timeB;
      if (byDate !== 0) return byDate;
      return a.index - b.index;
    })
    .map(({ item }) => item);
};

export { INVALID_DATE_POLICIES, toTimestampOrNull };
