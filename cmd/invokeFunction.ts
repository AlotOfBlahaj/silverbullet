import { SpaceSystem } from "../server/space_system.ts";

import plugAssetBundle from "../dist/plug_asset_bundle.json" assert {
  type: "json",
};
import { path } from "../plugos/deps.ts";
import { AssetBundle, AssetJson } from "../plugos/asset_bundle/bundle.ts";

export async function invokeFunction(
  options: any,
  pagesPath: string,
  functionName: string,
  ...args: string[]
) {
  console.log("Going to invoke function", functionName, "with args", args);
  const spaceSystem = new SpaceSystem(
    new AssetBundle(),
    new AssetBundle(plugAssetBundle as AssetJson),
    pagesPath,
    path.join(pagesPath, options.db),
  );

  await spaceSystem.start();

  const [plugName, funcName] = functionName.split(".");

  const plug = spaceSystem.system.loadedPlugs.get(plugName);

  if (!plug) {
    console.error("Plug not found", plugName);
    Deno.exit(1);
  }

  await plug.invoke(funcName, args);
  Deno.exit(0);
}
