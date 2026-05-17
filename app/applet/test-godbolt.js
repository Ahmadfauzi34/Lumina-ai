const fetch = require('node-fetch');

async function testGodbolt() {
  const response = await fetch('https://godbolt.org/api/compiler/python311/compile', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
    body: JSON.stringify({
      source: "print('hello world from python!')",
      options: {
        userArguments: "",
        executeParameters: { args: "", stdin: "" },
        compilerOptions: { executorRequest: true },
        filters: { execute: true },
        tools: []
      },
      allowStoreCodeDebug: true
    })
  });
  
  const text = await response.text();
  console.log("Godbolt response:", response.status, text);
}

testGodbolt();
