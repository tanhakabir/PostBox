import { logDebug } from './common';

export class ResponseParser {
    private status: number| undefined;
    private statusText: string | undefined;
    private headers: any | undefined;
    private config: any | undefined;
    private request: any | undefined;
    private data: any | undefined;

    constructor(response: any) {
        logDebug(response);
        let res = response;

        if(response.response && response.status === undefined) {
            res = response.response;
        }

        try {
            this.status = res.status;
            this.statusText = res.statusText;

            this.headers = {
                date: res.headers.date,
                allow: res.headers.allow,
                expires: res.headers.expires,
                "cache-control": res.headers["cache-control"],
                "content-type": res.headers["content-type"],
                "content-length": res.headers["content-length"],
                p3p: res.headers.p3p,
                server: res.headers.server,
                "x-xss-protection": res.headers["x-xss-protection"],
                "x-frame-options": res.headers["x-frame-option"],
                "set-cookie": res.headers["set-cookie"],
                connection: res.headers.connection,
                "transfer-encoding": res.headers["transfer-encoding"]
            };

            this.config = {
                timeout: res.config.timeout,
                xsrfCookieName: res.config.xsrfCookieName,
                xsrfHeaderName: res.config.xsrfHeaderName,
                headers: res.config.headers
            };

            this.request = {
                method: res.request.method,
                res: {
                    httpVersion:  res.request.res.httpVersion,
                    responseUrl: res.request.res.responseUrl
                }
            };

            this.data = res.data;
        } catch {
            throw new Error(response.message);
        }
    }

    parse() {
        return {
            "application/json": {
                status: this.status,
                statusText: this.statusText,
                headers: this.headers,
                config: this.config,
                request: this.request,
                data: this.data
            },
            "text/html": this.data
        };
    };
}