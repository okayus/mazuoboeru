import { describe, expect, it } from "vitest";
import { shuffle } from "./shuffle";

describe("shuffle", () => {
  it("returns a permutation: same multiset, same length, no drop/dup (real RNG, many runs)", () => {
    const input = ["a", "b", "c", "d", "e"];
    for (let run = 0; run < 200; run++) {
      const out = shuffle(input);
      expect(out).toHaveLength(input.length);
      expect([...out].sort()).toEqual([...input].sort());
    }
  });

  it("does not mutate the input", () => {
    const input = ["a", "b", "c"];
    const copy = [...input];
    shuffle(input);
    expect(input).toEqual(copy);
  });

  it("is deterministic for a given injected rng", () => {
    const seq = [0.99, 0.01, 0.5, 0.0];
    const make = () => {
      let i = 0;
      return () => seq[i++ % seq.length]!;
    };
    expect(shuffle(["a", "b", "c", "d"], make())).toEqual(shuffle(["a", "b", "c", "d"], make()));
  });

  it("actually permutes for a controlled rng (not identity)", () => {
    // i=2: j=floor(0*3)=0 → swap [2],[0] → ["c","b","a"]; i=1: j=floor(0*2)=0 → swap [1],[0] → ["b","c","a"]
    let k = 0;
    const rng = () => [0, 0][k++]!;
    expect(shuffle(["a", "b", "c"], rng)).toEqual(["b", "c", "a"]);
  });

  it("handles empty and single-element arrays (identity, rng untouched)", () => {
    expect(shuffle([])).toEqual([]);
    expect(
      shuffle(["x"], () => {
        throw new Error("rng must not be called for length<=1");
      }),
    ).toEqual(["x"]);
  });
});
