import { SysCallMapping } from "../../plugos/system.ts";
import { parse } from "../parse_tree.ts";
import { Language } from "../deps.ts";
import type { ParseTree } from "../tree.ts";

export function markdownSyscalls(lang: Language): SysCallMapping {
  return {
    "markdown.parseMarkdown": (_ctx, text: string): ParseTree => {
      return parse(lang, text);
    },
  };
}
