import * as vscode from 'vscode';
export declare class MethodCompletionItemProvider implements vscode.CompletionItemProvider {
    static readonly triggerCharacters: never[];
    provideCompletionItems(_document: vscode.TextDocument, _position: vscode.Position, _token: vscode.CancellationToken, _context: vscode.CompletionContext): vscode.ProviderResult<vscode.CompletionItem[] | vscode.CompletionList<vscode.CompletionItem>>;
}
export declare function registerLanguageProvider(): vscode.Disposable;
