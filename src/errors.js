export class ENFError extends Error {
  /** @param {string} message @param {string} code */
  constructor(message, code) {
    super(message);
    this.name = new.target.name;
    this.code = code;
  }
}

export class ENFSyntaxError extends ENFError {
  /** @param {string} message @param {string} code @param {{offset:number,line:number,column:number}} location */
  constructor(message, code, location) {
    super(message, code);
    this.offset = location.offset;
    this.line = location.line;
    this.column = location.column;
  }
}

export class ENFTypeError extends ENFError {}

export class ENFLimitError extends ENFError {
  /** @param {string} message @param {string} [code] */
  constructor(message, code = 'E_LIMIT') {
    super(message, code);
  }
}
