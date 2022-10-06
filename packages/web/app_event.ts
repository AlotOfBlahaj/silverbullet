import type { ParseTree } from "../common/tree.ts";

export type AppEvent =
  | "page:click"
  | "page:complete"
  | "page:load"
  | "editor:init"
  | "plugs:loaded";

export type ClickEvent = {
  page: string;
  pos: number;
  metaKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
};

export type IndexEvent = {
  name: string;
  text: string;
};

export type IndexTreeEvent = {
  name: string;
  tree: ParseTree;
};
