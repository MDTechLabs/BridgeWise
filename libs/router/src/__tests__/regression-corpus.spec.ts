/**
 * Replays every file in libs/router/corpus against the router.
 *
 * Each case becomes its own Jest test so failures point at the exact case.
 * See docs/ROUTING_REGRESSION_CORPUS.md for how to add or update cases.
 */

import { readdirSync, readFileSync } from "fs";
import { join } from "path";
import { assertCorpusConsistent, parseCorpusFile } from "../regression/corpus-validator";
import { formatRegressionReport, runRegressionCorpus } from "../regression/runner";
import { CorpusFile, RegressionReport } from "../regression/types";

const CORPUS_DIR = join(__dirname, "..", "..", "corpus");

function loadCorpus(): CorpusFile[] {
  return readdirSync(CORPUS_DIR)
    .filter((name) => name.endsWith(".json"))
    .sort()
    .map((name) => parseCorpusFile(JSON.parse(readFileSync(join(CORPUS_DIR, name), "utf8")), name));
}

const files = loadCorpus();
assertCorpusConsistent(files);

describe("routing regression corpus", () => {
  let report: RegressionReport;

  beforeAll(async () => {
    report = await runRegressionCorpus(files);
  });

  it("contains cases", () => {
    expect(files.length).toBeGreaterThan(0);
    expect(report.total).toBeGreaterThan(0);
  });

  for (const file of files) {
    describe(file.suite, () => {
      for (const c of file.cases) {
        it(`${c.id}${c.status === "known-issue" ? " (known issue)" : ""}`, () => {
          const result = report.results.find((r) => r.suite === file.suite && r.id === c.id)!;
          const expected = c.status === "known-issue" ? "xfail" : "pass";
          if (result.outcome !== expected) {
            throw new Error(
              `${file.suite}/${c.id}: expected outcome "${expected}", got "${result.outcome}"\n` +
                [...result.mismatches, ...(result.error ? [`error: ${result.error}`] : [])].map((m) => `  ${m}`).join("\n"),
            );
          }
        });
      }
    });
  }

  it("reports ok overall", () => {
    if (!report.ok) throw new Error(formatRegressionReport(report));
  });
});
