import { DEBUG_MODE, NAME, MIME_TYPE } from '../common/common';
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { TextDecoder, TextEncoder } from "util";
import { Method } from '../common/httpConstants';
import { RequestParser } from '../common/request';
import { ResponseParser, ResponseRendererElements } from '../common/response';
import { Url } from 'url';
const axios = require('axios').default;

interface RawNotebookCell {
	language: string;
	value: string;
	kind: vscode.NotebookCellKind;
    editable?: boolean;
    outputs: RawCellOutput[];
}

interface RawCellOutput {
	mime: string;
	value: any;
}

class NotebookKernel implements vscode.NotebookKernel {
    readonly id = 'rest-book-kernel';
    readonly label = 'REST Book Kernel';
    readonly supportedLanguages = ['rest-book'];

    description?: string | undefined;
    detail?: string | undefined;
    isPreferred?: boolean | undefined;
    preloads?: vscode.Uri[] | undefined;

    private _executionOrder = 0;


    async executeCellsRequest(document: vscode.NotebookDocument, ranges: vscode.NotebookCellRange[]): Promise<void> {
        for(let range of ranges) {
            for(let cell of document.getCells(range)) {
                const execution = vscode.notebook.createNotebookCellExecutionTask(cell.notebook.uri, cell.index, this.id)!;
			    await this._doExecution(execution);
            }
        }
    }

    private async _doExecution(execution: vscode.NotebookCellExecutionTask): Promise<void> {
        const doc = await vscode.workspace.openTextDocument(execution.cell.document.uri);

        execution.executionOrder = ++this._executionOrder;
		execution.start({ startTime: Date.now() });

        const metadata = {
			startTime: Date.now()
		};

        const logger = (d: any, r: any) => {
            try {
                const response = new ResponseParser(d, r);

                execution.replaceOutput([new vscode.NotebookCellOutput([
                    new vscode.NotebookCellOutputItem(MIME_TYPE, response.renderer()),
                    new vscode.NotebookCellOutputItem('application/json', response.json()),
                    new vscode.NotebookCellOutputItem('text/html', response.html())
                ], metadata)]);
        
                execution.end({ success: true });
            } catch (_) {
                execution.replaceOutput([new vscode.NotebookCellOutput([
                    new vscode.NotebookCellOutputItem('application/x.notebook.error-traceback', {
                        ename: d instanceof Error && d.name || 'error',
                        evalue: d instanceof Error && d.message || JSON.stringify(d, undefined, 4),
                        traceback: []
                    })
                ])]);
                execution.end({ success: false });
            }
        };

        let req;
        
        try {
            const parser = new RequestParser(doc.getText());
            req = parser.getRequest();
        } catch (err) {
            execution.replaceOutput([new vscode.NotebookCellOutput([
                new vscode.NotebookCellOutputItem('application/x.notebook.error-traceback', {
                    ename: err instanceof Error && err.name || 'error',
                    evalue: err instanceof Error && err.message || JSON.stringify(err, undefined, 4),
                    traceback: []
                })
            ])]);
            execution.end({ success: false });
            return;
        }

        try {
            const cancelTokenAxios = axios.CancelToken.source();

            let options = {...req};
            options['cancelToken'] = cancelTokenAxios.token;

            execution.token.onCancellationRequested(_ => cancelTokenAxios.cancel());

            let response = await axios(options);

            logger(response, req);
        } catch (exception) {
            logger(exception, req);
        }
        
    }
    
}

export class NotebookProvider implements vscode.NotebookSerializer, vscode.NotebookKernelProvider {
    async dataToNotebook(data: Uint8Array): Promise<vscode.NotebookData> {
        var contents = new TextDecoder().decode(data);    // convert to String to make JSON object

        // Read file contents
		let raw: RawNotebookCell[];
		try {
			raw = <RawNotebookCell[]>JSON.parse(contents);
		} catch {
			raw = [];
		}

        // Create array of Notebook cells for the VS Code API from file contents
		const cells = raw.map(item => new vscode.NotebookCellData(
			item.kind,
			item.value,
			item.language,
			item.outputs ? [new vscode.NotebookCellOutput(item.outputs.map(raw => new vscode.NotebookCellOutputItem(raw.mime, raw.value)))] : [],
			new vscode.NotebookCellMetadata().with({ editable: item.editable ?? true })
		));

        // Pass read and formatted Notebook Data to VS Code to display Notebook with saved cells
		return new vscode.NotebookData(
			cells,
			new vscode.NotebookDocumentMetadata().with({ cellHasExecutionOrder: true, })
		);
    }
    async notebookToData(data: vscode.NotebookData): Promise<Uint8Array> {
        // function to take output renderer data to a format to save to the file
		function asRawOutput(cell: vscode.NotebookCellData): RawCellOutput[] {
			let result: RawCellOutput[] = [];
			for (let output of cell.outputs ?? []) {
				for (let item of output.outputs) {
					result.push({ mime: item.mime, value: item.value });
				}
			}
			return result;
		}

        // Map the Notebook data into the format we want to save the Notebook data as

		let contents: RawNotebookCell[] = [];

		for (const cell of data.cells) {
			contents.push({
				kind: cell.kind,
				language: cell.language,
				value: cell.source,
				outputs: asRawOutput(cell)
			});
		}

        // Give a string of all the data to save and VS Code will handle the rest 
		return new TextEncoder().encode(JSON.stringify(contents));
    }


    provideKernels(_document: vscode.NotebookDocument, _token: vscode.CancellationToken): vscode.ProviderResult<vscode.NotebookKernel[]> {
        return [new NotebookKernel()];
    }

    async resolveNotebook(_document: vscode.NotebookDocument, webview: { readonly onDidReceiveMessage: vscode.Event<any>; postMessage(message: any): Thenable<boolean>; asWebviewUri(localResource: vscode.Uri): vscode.Uri; }): Promise<void>{
        webview.onDidReceiveMessage((m) => {
            switch(m.command) {
                case 'save-response': 
                    this._saveDataToFile(m.data);
                    return;
                default: break;
            }
        });
    }

    private async _saveDataToFile(data: ResponseRendererElements) {
        const workSpaceDir = path.dirname(vscode.window.activeTextEditor?.document.uri.fsPath ?? '');
        if (!workSpaceDir) { return; }
    
        let name;
        const url = data.request?.responseUrl;
        if(url) {
            let hostname = new Url(url).hostname ?? '';
            hostname = hostname.replace(/^[A-Za-z0-9]+\./g, '');
            hostname = hostname.replace(/\.[A-Za-z0-9]+$/g, '');
            name = hostname.replace(/\./g, '-');
        } else {
            name = 'unknown-url';
        }

        let date = new Date().toDateString().replace(/\s/g, '-');
        
        const defaultPath = vscode.Uri.file(path.join(workSpaceDir, `response-${name}-${date}.json`));
        const location = await vscode.window.showSaveDialog({ defaultUri: defaultPath });
        if(!location) { return; }
    
        fs.writeFile(location?.fsPath, JSON.stringify(data, null, 4), { flag: 'w' }, (e) => {
            vscode.window.showInformationMessage(e?.message || `Saved response to ${location}`);
        });
    };
    
}