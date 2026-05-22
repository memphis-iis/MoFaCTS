export function stripSpacesAndLowerCase(input: string): string {
  return input.replace(/ /g, "").toLowerCase();
}
