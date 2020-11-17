import { URL, parse } from 'url';

export const DEBUG_MODE = false;

export function validateURL(url: string): boolean {
    const protocols = ['http', 'https'];

    try {
        new URL(url);
        const parsed = parse(url);
        if (DEBUG_MODE) { console.log(parsed.protocol); }
        return protocols
            ? parsed.protocol
                ? protocols.map(x => `${x.toLowerCase()}:`).includes(parsed.protocol) 
                    ? true : false
                : false
            : true;
    } catch (err) {
        return false;
    }
}