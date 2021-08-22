import { Injectable } from "@angular/core";
import { Action, createSelector, Select, Selector, State, StateContext } from "@ngxs/store";
import { append, patch, updateItem } from "@ngxs/store/operators";
import { Guid } from "guid-typescript";
import { Observable } from "rxjs";
import { IUserState } from "src/app/shared/IUserState";
import { UpdateUserStateAction } from "./userstate.actions";

export interface UserStateModel {
  userstates: IUserState[]
}

@State<UserStateModel>({
  name: 'userstates',
  defaults: {
    userstates: []
  }
})
@Injectable()
export class UserStateState {
  //@Select((state: any) => state.userstates) userstates$?: Observable<UserStateModel>;

  @Action(UpdateUserStateAction)
  updateUserState(ctx: StateContext<UserStateModel>, action: UpdateUserStateAction) {
    const state = ctx.getState();
    const index = state.userstates.findIndex((userstate => userstate?.guid === action.guid));

    const newstate : IUserState = {
      guid: action.guid,
      state: action.state
    };

    if (index === -1) {
      ctx.setState(patch({
        userstates: append([newstate])
      }));
    } else {
      ctx.setState(patch({
        userstates: updateItem<IUserState>(index, newstate)
      }));
    }
  }

  @Selector()
  static userstate(state: UserStateModel) {
    return (guid?: Guid) => {
      if (!guid) {
        return {}
      }
      return state.userstates.find(value => value.guid === guid)?.state ?? {};
    }
  }

  // static userstate(guid?: Guid) {
  //   return createSelector([UserStateState], (state: UserStateModel) => {
  //     return state.userstates.find(s => s.guid === guid)?.state ?? {};
  //   });
  // }
}
