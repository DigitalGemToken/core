import { IServer } from "../../interfaces";

export const plugin = {
    // tslint:disable-next-line: no-empty
    async register(server: IServer): Promise<void> {},
    name: "Exchange API",
    version: "1.0.0",
};