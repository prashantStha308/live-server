import express from "express"
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import * as fsPromise from 'node:fs/promises';
import * as fs from 'node:fs';
import * as path from 'node:path';

// Express app
const app = express();
// CLI args
const argv = yargs(hideBin(process.argv)).parse();
const PORT = 3000;

let pathToFile = argv.path;
let clients = []

// Keeps an eye on the file
function watchFile(filePath) {
    fs.watch(filePath, () => {
        clients.forEach(res => {
            res.write('data: reload\n\n');
        });
    });
}

// Path for SSE(Server Side Event) Connection.
app.get('/live', (req, res, next)=>{
	// Set headers to keep the connection alive and tell the client we're sending event-stream data
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    res.flushHeaders();

    clients.push(res);

    req.on('close', () => {
        clients = clients.filter(c => c !== res);
    });
})

async function serveWithInjection(res, filePath){
	let html = await fsPromise.readFile(filePath, 'utf-8');

	const injection = `
	<script>
		const event = new EventSource('/live');
		event.onmessage = ()=> location.reload();
	</script>
	`;

	html = html.replace('</body>', `${injection}</body>`);

    res.setHeader('Content-Type', 'text/html');
    res.send(html);
}

function startServer(finalPath){

	watchFile(finalPath);

	app.get('/', async (req, res) => await serveWithInjection(res, finalPath ) )

	app.listen(PORT,()=>{
		console.log(`Server running in port ${PORT}`);
		console.log(`http://localhost:${PORT}`);
	})
}

// resolve file path and start server
async function handleDir(pathToFile){
	const entries = await fsPromise.readdir(pathToFile);
	
	if(!entries.includes("index.html")){
		console.log("Path must resolve to index.html");
		process.exit(1);
	}

	const finalPath = path.resolve(path.join(pathToFile, 'index.html'));

	startServer(finalPath);
}

(async () => {

	if( !pathToFile ){
		console.log("path to file cannot be null");
		process.exit(1);
	}
    
    const stat = await fsPromise.stat(pathToFile);

    if (stat.isFile()) {

        if (path.basename(pathToFile) !== 'index.html') {
            console.log("The file must be index.html");
            process.exit(1);
        }

        console.log(pathToFile);
        startServer(pathToFile);
    } 
    else if (stat.isDirectory()) {
        await handleDir(pathToFile);
    }
})();