const fs = require('node:fs');
require('occt-import-js')().then(occt => {
 const result = occt.ReadStepFile(fs.readFileSync(process.argv[2]), {linearUnit:'millimeter',linearDeflectionType:'absolute_value',linearDeflection:0.5,angularDeflection:0.35});
 if (!result.success || !result.meshes.length) throw Error('STEP conversion failed');
 fs.writeFileSync('apps/web/public/models/delta-assembly.json',JSON.stringify(result));
 console.log(JSON.stringify({meshes:result.meshes.length,names:result.meshes.map(m=>m.name)}));
});
