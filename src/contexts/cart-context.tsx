import { trpc } from "@/client/trpc";
import type { AppRouter } from "@/server/api/routers/_app";
import type { inferProcedureOutput } from "@trpc/server";
import {
  createContext,
  useContext,
  useEffect,
  useReducer,
  useRef,
  type ReactNode,
} from "react";
import { toast } from "sonner";
import { z } from "zod";
export const cartItemSchema = z.object({
  itemId: z.uuid(),
  quantity: z.number().min(1),
});

type GetItemsOutput = inferProcedureOutput<AppRouter["item"]["get"]>;
export type CartItem = GetItemsOutput & { quantity: number };

export function getCartItemMaxQuantity(item: Pick<CartItem, "consumable">) {
  return item.consumable?.available ?? 1;
}

export function getNextCartQuantity(
  currentQuantity: number,
  requestedQuantity: number,
  maxQuantity: number,
) {
  const nextQuantity = currentQuantity + requestedQuantity;

  if (requestedQuantity < 1 || maxQuantity < 1 || nextQuantity > maxQuantity) {
    return null;
  }

  return nextQuantity;
}

export function resolveCartItemAddition(
  existingItem: CartItem | undefined,
  incomingItem: CartItem,
) {
  const currentQuantity = existingItem?.quantity ?? 0;
  const maxQuantity = getCartItemMaxQuantity(existingItem ?? incomingItem);
  const nextQuantity = getNextCartQuantity(
    currentQuantity,
    incomingItem.quantity,
    maxQuantity,
  );

  if (nextQuantity === null) {
    return null;
  }

  return {
    ...(existingItem ?? incomingItem),
    quantity: nextQuantity,
  };
}

const CartActions = {
  ADD_ITEM: "ADD_ITEM",
  REMOVE_ITEM: "REMOVE_ITEM",
  UPDATE_QTY: "UPDATE_QTY",
  CLEAR_CART: "CLEAR_CART",
  LOAD_CART: "LOAD_CART",
} as const;

export type CartAction =
  | { type: typeof CartActions.ADD_ITEM; payload: CartItem }
  | { type: typeof CartActions.REMOVE_ITEM; id: string | number }
  | {
      type: typeof CartActions.UPDATE_QTY;
      payload: { id: string | number; qty: number };
    }
  | { type: typeof CartActions.CLEAR_CART }
  | { type: typeof CartActions.LOAD_CART; payload: CartItem[] };

interface CartState {
  items: CartItem[];
  itemIds: Set<string | number>;
  lastAction: CartAction | undefined;
}

function cartReducer(state: CartState, action: CartAction): CartState {
  switch (action.type) {
    case CartActions.ADD_ITEM: {
      const itemIdx = state.items.findIndex(
        (item) => item.id === action.payload.id,
      );
      const existingItem = itemIdx === -1 ? undefined : state.items[itemIdx];

      // New entry to the cart, append item to cart.
      if (!existingItem) {
        return {
          ...state,
          lastAction: action,
          items: [...state.items, action.payload],
          itemIds: new Set([
            ...state.items.map((item) => item.id),
            action.payload.id,
          ]),
        };
      }

      // Item already exists, replace it with the merged cart quantity.
      const updatedItems = [...state.items];
      updatedItems[itemIdx] = action.payload;

      return {
        ...state,
        items: updatedItems,
        lastAction: action,
      };
    }

    case CartActions.REMOVE_ITEM: {
      return {
        ...state,
        items: state.items.filter((item) => item.id !== action.id),
        itemIds: new Set([...state.itemIds].filter((id) => id !== action.id)),
        lastAction: action,
      };
    }

    case CartActions.UPDATE_QTY: {
      return {
        ...state,
        lastAction: action,
        items: state.items.map((item) => {
          if (item.id === action.payload.id) {
            const maxQty = item.consumable?.available ?? Infinity;
            const newQty = Math.max(Math.min(maxQty, action.payload.qty), 1);
            return { ...item, quantity: newQty };
          }

          return item;
        }),
      };
    }

    case CartActions.CLEAR_CART: {
      return {
        ...state,
        items: [],
        itemIds: new Set(),
        lastAction: action,
      };
    }

    case CartActions.LOAD_CART: {
      return {
        ...state,
        items: action.payload,
        itemIds: new Set(action.payload.map((item) => item.id)),
        lastAction: action,
      };
    }
  }
}

export interface CartContextType {
  items: CartItem[];
  addItem: (item: CartItem) => boolean;
  removeItem: (itemId: string | number) => void;
  updateQty: (itemId: string | number, quantity: number) => void;
  clearCart: () => void;
  itemCount: number;
  itemInCart: (itemId: string | number) => boolean;
  getItem: (itemId: string | number) => CartItem | undefined;
  checkout: () => void;
}

const initialState: CartState = {
  items: [],
  itemIds: new Set(),
  lastAction: undefined,
};

const CartContext = createContext<CartContextType | undefined>(undefined);

interface CartProviderProps {
  children: ReactNode;
  persistToLocalStorage?: boolean;
  localStorageKey?: string;
}

export function CartProvider({
  children,
  persistToLocalStorage = true,
  localStorageKey = "cart",
}: CartProviderProps) {
  const [state, dispatch] = useReducer(cartReducer, initialState);
  const isInitialMount = useRef(true);

  const utils = trpc.useUtils();

  const checkoutMut = trpc.item.checkoutCart.useMutation({
    onSuccess: () => {
      toast.success("Items checked out successfully");
      clearCart();
      void utils.item.list.invalidate();
    },
    onError: (error) => {
      toast.error(`Failed to check out items: ${error.message}`);
    },
  });

  // load cart on localstorage on mount
  useEffect(() => {
    if (!persistToLocalStorage) {
      isInitialMount.current = false;
      return;
    }

    try {
      const savedCart = localStorage.getItem(localStorageKey);
      if (savedCart) {
        const cartData: CartItem[] = JSON.parse(savedCart) as CartItem[];
        if (Array.isArray(cartData)) {
          dispatch({
            type: CartActions.LOAD_CART,
            payload: cartData,
          });
        }
      }
    } catch (err) {
      console.error(err);
      localStorage.removeItem(localStorageKey);
    } finally {
      isInitialMount.current = false;
    }
  }, [persistToLocalStorage, localStorageKey]);

  // Save cart to localStorage whenever it changes
  useEffect(() => {
    const noItemsInCart = state.items.length === 0;
    const isMounting =
      !persistToLocalStorage || (noItemsInCart && isInitialMount.current);
    const prevActionIsRemove =
      state.lastAction?.type !== CartActions.REMOVE_ITEM &&
      state.lastAction?.type !== CartActions.CLEAR_CART;

    // Don't update localstorage when there is no items or on initial mount.
    // Otherwise the cart will say goodbye.
    if (isMounting || (noItemsInCart && prevActionIsRemove)) {
      return;
    }

    try {
      localStorage.setItem(localStorageKey, JSON.stringify(state.items));
    } catch (err) {
      console.error("error saving cart to localstorage:", err);
    }
  }, [state.items, state.lastAction, persistToLocalStorage, localStorageKey]);

  // Cart actions
  const addItem = (cartItem: CartItem) => {
    if (!cartItem.consumable) {
      if (cartItem.stored === false) {
        toast.error(
          `${cartItem.name} is marked as Lab Use and cannot be checked out.`,
        );
        return false;
      }

      const latest = cartItem.ItemRecords?.slice().sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      )[0];
      if (latest?.loaned) {
        toast.error(`${cartItem.name} is currently on loan.`);
        return false;
      }
    }

    const existingItem = state.items.find((item) => item.id === cartItem.id);
    const nextItem = resolveCartItemAddition(existingItem, cartItem);

    if (nextItem === null) {
      const currentQuantity = existingItem?.quantity ?? 0;
      const maxQuantity = getCartItemMaxQuantity(existingItem ?? cartItem);
      const availableQuantity = Math.max(maxQuantity - currentQuantity, 0);
      toast.error(
        availableQuantity > 0
          ? `Only ${availableQuantity} more available`
          : "No additional items are available",
      );
      return false;
    }

    dispatch({
      type: CartActions.ADD_ITEM,
      payload: nextItem,
    });

    return true;
  };

  const removeItem = (itemId: string | number) => {
    dispatch({ type: CartActions.REMOVE_ITEM, id: itemId });
  };

  const updateQty = (itemId: string | number, quantity: number) => {
    dispatch({
      type: CartActions.UPDATE_QTY,
      payload: { id: itemId, qty: quantity },
    });
  };

  const getItem = (itemId: string | number): CartItem | undefined => {
    return itemInCart(itemId)
      ? state.items.find((item) => item.id === itemId)
      : undefined;
  };

  const clearCart = () => {
    dispatch({ type: CartActions.CLEAR_CART });
  };

  const itemCount = state.items.reduce(
    (total, item) => total + item.quantity,
    0,
  );

  const itemInCart = (itemId: string | number) => {
    return state.itemIds.has(itemId);
  };

  const checkout = () => {
    const payload = state.items.map((item) => ({
      itemId: item.id,
      quantity: item.quantity,
    }));
    checkoutMut.mutate(payload);
  };

  const value: CartContextType = {
    items: state.items,
    addItem: addItem,
    removeItem: removeItem,
    updateQty: updateQty,
    clearCart: clearCart,
    itemCount: itemCount,
    itemInCart: itemInCart,
    getItem: getItem,
    checkout: checkout,
  };

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

// hook to use cart context
export function useCart(): CartContextType {
  const context = useContext(CartContext);
  if (!context) {
    throw new Error("useCart must be used within a CartProvider");
  }
  return context;
}
