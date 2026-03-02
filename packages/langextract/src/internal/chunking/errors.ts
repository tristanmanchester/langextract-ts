import { LangExtractError } from "../core/errors.js";

export class TokenUtilError extends LangExtractError {
  constructor(message: string) {
    super(message);
    this.name = "TokenUtilError";
  }
}
