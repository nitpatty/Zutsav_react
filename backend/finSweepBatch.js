"use strict";
const fs = require("fs");
const path = require("path");

const root = "C:/Users/HP/OneDrive/Documents/zutsav-updated/backend";

// Exact scratch names I authored across this session (by basename).
const scratchBases = new Set([
  "tmpSweep", "tmpSweep2", "tmpGround", "tmpGround2", "tmpGround3",
  "tmpGround4", "tmpGround5", "tmpGround6", "tmpGroundTruth",
  "tmpGroundTruth2", "tmpGroundTruth3", "tmpGroundTruth4", "tmpGroundTruth5",
  "tmpGroundTruth6", "tmpGroundTruth7", "tmpGroundTruthCheck",
  "tmpGroundTruth2Check", "tmpGroundTruth3Check", "tmpGroundTruthShow",
  "tmpExact", "tmpExact2", "tmpExactAdmin", "tmpExactAdminCheck",
  "tmpExactAdminBlock", "tmpExactEmailDeps", "tmpExactEmailParity",
  "tmpNear", "tmpNear2", "tmpNearly", "tmpNearly2", "tmpLoad",
  "tmpLoadCheck", "tmpLoadCheck2", "tmpRuntimeLoad", "tmpRuntimeLoadCheck",
  "tmpRender", "tmpRenderRuntime", "tmpRenderParity", "tmpRenderParityRun",
  "tmpDryRunParity", "tmpDryRunParityRuntime", "tmpParity", "tmpParityRun",
  "tmpParityRuntime", "tmpParitySmoke", "tmpParityExact", "tmpParityExactRun",
  "tmpSend", "tmpSendParity", "tmpSendParityRun", "tmpSendRuntimeCheck",
  "tmpRuntime", "tmpRuntimeParity", "tmpRuntimeRenderCheck",
  "tmpRuntimeSendCheck", "tmpRuntimeSmoke", "tmpShow", "tmpShow2",
  "tmpShowAdmin", "tmpShowEmailChannel", "tmpShowGroundTruth",
  "tmpShowGroundTruth2", "tmpShowParityBlock", "tmpShowExactBlock",
  "tmpShowExactParity", "tmpShowAdminBlock", "tmpShowExactAdmin",
  "tmpShowExactEmailChannel", "tmpShowExactJoin", "tmpShowCurrent",
  "tmpShowGround", "tmpShowParity", "tmpDump", "tmpDump2", "tmpDumpAll",
  "tmpDumpParity", "tmpP", "tmpP2", "tmpP3", "tmpPatch", "tmpPatch2",
  "tmpPatchAdmin", "tmpPatchAdminPreview", "tmpPatchAdminDryRunParity",
  "tmpPatchExact", "tmpPatchExactBlock", "tmpPatchedAdminBlock",
  "tmpLoaded", "tmpLoaded2", "tmpJoin", "tmpJoin2", "tmpJoinShow",
  "tmpJoinGround", "tmpJoinExact", "tmpTidy", "tmpTidy2", "tmpSweepAll",
  "tmpAll", "tmpAll2", "tmpRenderCheck", "tmpRenderParityCheck",
  "tmpNotFound", "tmpNotFound2", "tmpLookup", "tmpLookup2",
  "tmpScratch", "tmpScratch2", "tmpDateLabel", "tmpWalk", "tmpWalkShow",
  "tmpRecipe", "tmpNowNear", "tmpN", "tmpN2", "tmpShowDate", "tmpDate",
  "tmpFinal", "tmpFinal2", "tmpFinalSweep", "tmpFinalClean",
  "tmpLeftover", "tmpLeftoverCheck", "tmpLeftovers", "tmpList",
  "tmpNamed", "tmpNamedList", "tmpCheck", "tmpCheckAll",
  "tmpRuntimeFinal", "tmpF", "tmpSearch", "tmpSearchAll", "tmpSweepFinal",
  "tmpGroundTruthFinal", "tmpGroundTruthFinal2", "tmpExactShow",
  "tmpShowExactAdminFinal", "tmpShowAdminFinal", "tmpDryRunFinal",
  "tmpParityFinal", "tmpEmailFinal", "tmpMsg", "tmpMsg2", "tmpPrint",
  "tmpPrint2",
]);

const removed = [];
const walk = (dir) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (/node_modules|\.git|\.next|coverage|dist|build/.test(e.name)) continue;
      walk(full);
    } else if (e.name.endsWith(".js") && scratchBases.has(path.basename(e.name, ".js"))) {
      removed.push(full);
    }
  }
};

try {
  walk(root);
} catch (_) {
  // no-op: sweep is best-effort
}
for (const f of removed) {
  try {
    fs.unlinkSync(f);
  } catch (_) {
    // no-op
  }
}
console.log("SWEPT=" + removed.length);
console.log("SWEEP_DONE");
