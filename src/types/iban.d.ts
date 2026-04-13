declare module "iban" {
  export function isValid(iban: string): boolean
  export function electronicFormat(iban: string): string
  export function printFormat(iban: string, separator?: string): string
  export function toBBAN(iban: string, separator?: string): string
  export function fromBBAN(countryCode: string, bban: string): string
  export function isValidBBAN(countryCode: string, bban: string): boolean
}
