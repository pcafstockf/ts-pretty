import * as os from 'os';

function foo(value: string): void {
 try {
   if (value === "bar") console.log('Its bar');
else {
			console.log('Its not bar')
		}
}
	catch(err) { throw err} finally {console.log("Done")}
}



