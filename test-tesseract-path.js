const Tesseract = require('tesseract.js');
const path = require('path');

async function test() {
  try {
    const workerPath = path.join(process.cwd(), 'node_modules/tesseract.js/src/worker-script/node/index.js');
    const corePath = path.join(process.cwd(), 'node_modules/tesseract.js-core/tesseract-core.wasm.js');
    console.log('Worker path:', workerPath);
    console.log('Core path:', corePath);

    const worker = await Tesseract.createWorker('fra', 1, {
      workerPath: workerPath,
      corePath: corePath
    });
    console.log('Worker created successfully!');
    await worker.terminate();
  } catch (err) {
    console.error('ERROR:', err);
  }
}
test();
