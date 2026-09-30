export interface ColorViolation {
  file: string;      // Full path to the file
  line: number;      // Line number for the developer to find
  column: number;    // Column for precision
  value: string;     // The hardcoded color (e.g., #ff0000)
  property: string;  // The CSS property (e.g., "border-color")
  suggestions?: string[]; // Design tokens with the same color, primary first (e.g., ["$primary-blue"])
}