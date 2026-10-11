/** A small named palette: distinct from each other, readable as a dot on both light and dark. */
export const TOPIC_COLORS = [
  { name: "Red", value: "#e5484d" },
  { name: "Orange", value: "#f76808" },
  { name: "Yellow", value: "#e5b800" },
  { name: "Green", value: "#30a46c" },
  { name: "Teal", value: "#12a594" },
  { name: "Blue", value: "#3e63dd" },
  { name: "Purple", value: "#8e4ec6" },
  { name: "Pink", value: "#d6409f" },
  { name: "Gray", value: "#8b8d98" },
] as const;

/** "Blue" for a palette value, the hex itself for a colour set some other way. */
export const colorName = (value: string) => TOPIC_COLORS.find((c) => c.value.toLowerCase() === value.toLowerCase())?.name ?? value;