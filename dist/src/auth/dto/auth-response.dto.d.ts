export declare class AuthUserDto {
    id: string;
    name: string;
    email: string;
    companyActiveId: string | null;
}
export declare class AuthResponseDto {
    accessToken: string;
    refreshToken: string;
    user: AuthUserDto;
}
