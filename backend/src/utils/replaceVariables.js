const replaceVariables = (template, data = {}) =>
  template.replace(/{{\s*([a-zA-Z0-9_]+)\s*}}/g, (_, key) => (data[key] ?? "").toString());

module.exports = replaceVariables;
