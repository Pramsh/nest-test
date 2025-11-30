import { Controller, Get, Req, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { UserGatewayService } from "./user.service";

@Controller("user")

export class UserGatewayController {
    constructor(private readonly userService: UserGatewayService) {}

    @Get('me')
    @UseGuards(JwtAuthGuard)
    me(@Req() req: any) {
    return req.user;
    }


    @Get('users')
    @UseGuards(JwtAuthGuard)
    users(@Req() req: any) {
    return this.userService.getAllUsers(req.user.id);
    }
    
}