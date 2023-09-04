export default interface User {
    token?: string;
    user: string;
    email: string;
    password: string;
    affilations: string[];
    affiliate: string | null;
    balance: number
}
