import { Editor } from "./editor.tsx";
import { parseYamlSettings, safeRun } from "../common/util.ts";
import { Space } from "../common/spaces/space.ts";
import { HttpSpacePrimitives } from "../common/spaces/http_space_primitives.ts";

safeRun(async () => {
  let password: string | undefined = localStorage.getItem("password") ||
    undefined;

  let httpPrimitives = new HttpSpacePrimitives("", password);
  let settingsPageText = "";
  // while (true) {
  //   try {
  //     settingsPageText = (await (
  //       await httpPrimitives.readFile("SETTINGS.md", "string")
  //     ).data) as string;
  //     break;
  //   } catch (e: any) {
  //     if (e.message === "Unauthorized") {
  //       password = prompt("Password: ") || undefined;
  //       if (!password) {
  //         alert("Sorry, need a password");
  //         return;
  //       }
  //       localStorage.setItem("password", password!);
  //       httpPrimitives = new HttpSpacePrimitives("", password);
  //     }
  //   }
  // }
  let serverSpace = new Space(httpPrimitives);
  serverSpace.watch();

  console.log("Booting...");

  let settings = parseYamlSettings(settingsPageText);

  let editor = new Editor(
    serverSpace,
    document.getElementById("sb-root")!,
    "",
    settings.indexPage || "index",
  );
  await editor.init();
  // @ts-ignore
  window.editor = editor;
});

// if (!isDesktop) {
// if (localStorage.getItem("disable_sw") !== "true") {
//   if (navigator.serviceWorker) {
//     navigator.serviceWorker
//       .register(new URL("service_worker.ts", import.meta.url), {
//         type: "module",
//       })
//       .then((r) => {
//         console.log("Service worker registered...");
//       });
//   } else {
//     console.log(
//       "No launching service worker (not present, maybe because not running on localhost or over SSL)",
//     );
//   }
// } else {
//   console.log("Service worker disabled via disable_sw");
// }

// }
