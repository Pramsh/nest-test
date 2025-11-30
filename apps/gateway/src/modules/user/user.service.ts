import { Injectable } from "@nestjs/common";
import { SendService } from "../../utils/rcp.send"; 
import { CacheService, InjectCache } from "@common/cache";

@Injectable()
export class UserGatewayService {
  constructor(
    @InjectCache() private readonly cacheService: CacheService,
    private readonly sendService: SendService,
  ) {}

  async getAllUsers(userId:string){
    const data = await this.cacheService.get(`user_list:${userId}`);
    if(data){
      return data;
    }
    const newData = await this.sendService.send('auth.get_all_users',{});
    await this.cacheService.set(`user_list:${userId}`,newData,300); //cache for 5 minutes
    return newData;
  }
}