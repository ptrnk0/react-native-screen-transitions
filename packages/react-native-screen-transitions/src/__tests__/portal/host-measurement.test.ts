import { beforeEach, expect, it, mock } from "bun:test";

let measurements = 0;
let retries = 0;
let result: { x: number; y: number; pageX: number; pageY: number; width: number; height: number } | null;
let prepare: () => unknown;
let react: (value: unknown, previous: unknown) => void;
let cursor = 0;
let values: ReturnType<typeof mutable>[] = [];
const mutable = (initial: any) => {
 let value = initial;
 return {get: () => value, set: (next: any) => {value = next;}};
};
mock.module("react-native-reanimated", () => ({
 useDerivedValue: (factory: () => unknown) => ({get:factory}),
 useSharedValue: (value: any) => values[cursor++] ?? (values[cursor - 1] = mutable(value)),
 useAnimatedRef: () => ({}),
 useAnimatedReaction: (p: typeof prepare, r: typeof react) => {prepare = p; react = r;},
 measure: () => {measurements++; return result;},
 cancelAnimation: () => {},
 withDelay: (_: number, value: any) => {retries++; return value;},
 withTiming: (value: any) => value,
}));
const {useHostMeasurement} = await import("../../components/boundary/portal/hooks/use-host-measurement");
const source = mutable(null);
const render = (measurementKey: string | null) => {
 cursor = 0;
 return useHostMeasurement({measurementKey, boundaryMeasurements: [source]});
};
const tick = (count = 1) => {
 for (let i = 0; i < count; i++) react(prepare(), null);
};
beforeEach(() => {
 measurements = 0; retries = 0; values = []; cursor = 0;
 source.set({bounds: {}, pairKey: "a<>b"});
 result = {x: 0, y: 0, pageX: 804, pageY: 0, width: 402, height: 874};
});

it("stops measuring and scheduling retries after success", () => {
 const host = render("host");
 tick();
 result!.pageX = 0;
 tick(100);
 expect(host.hostBounds.get()?.pageX).toBe(804);
 expect(measurements).toBe(1);
 expect(retries).toBe(0);
});

for (const invalid of [null, {x:0,y:0,pageX:0,pageY:0,width:0,height:0}]) {
 it(`caps ${invalid === null ? "missing" : "zero-size"} measurements at 20 attempts`, () => {
  result = invalid;
  const host = render("host");
  tick(100);
  expect(measurements).toBe(20);
  expect(retries).toBe(19);
  expect(host.hostBounds.get()).toBeNull();
  render("host");
  tick(100);
  expect(measurements).toBe(20);
 });
}

it("starts a fresh budget for a different key and stops as soon as it succeeds", () => {
 result = null;
 render("old-host");
 tick(100);
 const host = render("new-host");
 tick(3);
 expect(measurements).toBe(23);
 result = {x:0,y:0,pageX:0,pageY:0,width:100,height:100};
 tick(100);
 expect(measurements).toBe(24);
 expect(host.hostBounds.get()?.width).toBe(100);
 expect(retries).toBe(22);
});

it("accepts a valid measurement on the twentieth attempt", () => {
 result = null;
 const host = render("host");
 tick(19);
 result = {x:0,y:0,pageX:0,pageY:0,width:100,height:100};
 tick(100);
 expect(measurements).toBe(20);
 expect(host.hostBounds.get()?.width).toBe(100);
 expect(retries).toBe(19);
});

it("does not measure without a key", () => {
 render(null);
 tick(100);
 expect(measurements).toBe(0);
 expect(retries).toBe(0);
});

 it("waits for source capture before caching the host position", () => {
  source.set(null);
  result!.pageY = 1812;
  const host = render("host");
  tick(100);
  expect(measurements).toBe(0);
  expect(retries).toBe(0);
  expect(host.hostBounds.get()).toBeNull();
  result!.pageY = 63;
  source.set({bounds: {}, pairKey: "a<>b"});
  tick(100);
  expect(host.hostBounds.get()?.pageY).toBe(63);
  expect(measurements).toBe(1);
  expect(retries).toBe(0);
 });

it("withholds a previous key's bounds until the new key is measured", () => {
 const old = render("old");
 tick();
 expect(old.hostBounds.get()).not.toBeNull();
 result = null;
 const next = render("new");
 expect(next.hostBounds.get()).toBeNull();
 tick(3);
 expect(next.hostBounds.get()).toBeNull();
 result = {x:0,y:0,pageX:12,pageY:24,width:100,height:100};
 tick();
 expect(next.hostBounds.get()?.pageX).toBe(12);
 tick(100);
 expect(measurements).toBe(5);
});
