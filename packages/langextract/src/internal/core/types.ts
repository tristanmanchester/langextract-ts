export enum FormatType {
  YAML = "yaml",
  JSON = "json",
}

export interface CharInterval {
  startPos: number;
  endPos: number;
}

export interface TokenInterval {
  startIndex: number;
  endIndex: number;
}
