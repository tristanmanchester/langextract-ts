export const boundaryElements = [
  { type: "package-langextract", pattern: "packages/langextract/**/*" },
  { type: "scripts", pattern: "scripts/**/*" },
];

export const boundaryRules = {
  default: "disallow",
  rules: [
    {
      from: ["package-langextract"],
      allow: ["package-langextract"],
    },
    {
      from: ["scripts"],
      allow: ["scripts", "package-langextract"],
    },
  ],
};
