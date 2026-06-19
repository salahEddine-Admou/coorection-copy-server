const Tesseract = require('tesseract.js');

async function test() {
  try {
    console.log('Creating worker...');
    const worker = await Tesseract.createWorker('fra', 1, {
      corePath: 'https://cdn.jsdelivr.net/npm/tesseract.js-core@5.1.0/tesseract-core.wasm.js',
      workerPath: 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.0/dist/worker.min.js',
    });
    console.log('Worker created successfully!');
    await worker.terminate();
  } catch (err) {
    console.error('ERROR:', err);
  }
}
test();
