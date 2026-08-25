// Barrel export — re-exports all UI primitives
// Import as: import { Button, Card, Badge, ... } from '@/components/ui'

export { Button, buttonVariants, type ButtonProps } from './button';
export { Badge, badgeVariants, type BadgeProps } from './badge';
export {
    Card,
    CardHeader,
    CardFooter,
    CardTitle,
    CardDescription,
    CardContent,
} from './card';
export { Input } from './input';
export { Textarea } from './textarea';
export { Label } from './label';
export { Checkbox } from './checkbox';
export { Switch } from './switch';
export { Skeleton } from './skeleton';
export {
    Avatar,
    AvatarImage,
    AvatarFallback,
} from './avatar';
export { default as Title } from './title';
export { default as PageTitle } from './page-title';
export { default as FormBox } from './form-box';
export {
    Dialog,
    DialogPortal,
    DialogOverlay,
    DialogClose,
    DialogTrigger,
    DialogContent,
    DialogHeader,
    DialogFooter,
    DialogTitle,
    DialogDescription,
} from './dialog';
export {
    Select,
    SelectGroup,
    SelectValue,
    SelectTrigger,
    SelectContent,
    SelectLabel,
    SelectItem,
    SelectSeparator,
    SelectScrollUpButton,
    SelectScrollDownButton,
} from './select';
export {
    Tabs,
    TabsList,
    TabsTrigger,
    TabsContent,
} from './tabs';
export {
    DropdownMenu,
    DropdownMenuTrigger,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuCheckboxItem,
    DropdownMenuRadioItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuShortcut,
    DropdownMenuGroup,
    DropdownMenuPortal,
    DropdownMenuSub,
    DropdownMenuSubContent,
    DropdownMenuSubTrigger,
    DropdownMenuRadioGroup,
} from './dropdown-menu';
export {
    type ToastProps,
    type ToastActionElement,
    ToastProvider,
    ToastViewport,
    Toast,
    ToastTitle,
    ToastDescription,
    ToastClose,
    ToastAction,
} from './toast';
