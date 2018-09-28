# Notes on UI

The file `flex-tools-full` shows the flex box design for the full tools bar. The file
`flex-tools-light` shows the design for the reduced tools bar, including only the viewing
functionalities.

Aligning the different divs together is not simple. One important point is to use
`box-sizing: border-box` as box-sizing model. With this setting, the `width: 100%` value
takes into account not only the div's content, but also the padding and the border.
Importantly, it does not take into account the margin, so it's better to avoid using
margin.

The main flex of the full tool bar has 5 children: (1) header, (2) slider, (3) buttons,
(4) pen size and (5) chat. The size of the first 4 children is fixed, but the chat child's
height stretches to fill the total height of main flex. A problem appears when we want to
make a div inside this last children (the chat box) use 100% of the height. The solution
is to make the chat box itself a flex container, and then make the div inside it flexible.

In the chat box this pattern is used several times, like this:

```
<div id='chatBlock' style='flex:1 1 auto;display:flex'>
    <div id='chatBlockContent' style='flex:1;display:flex;flex-direction:column'>
        <div style='flex:0 0 28px'></div>
        <div style='flex:1 1 auto;display:flex'>
            <div id='log' class='a' style='flex:1'></div>
        </div>
        <div style='flex:0 0 28px'></div>
    </div>
</div>
```
