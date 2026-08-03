# Embedding a brain in your own page

BrainBox data can be embedded in any web page, the way a video is: the visitor
gets a working viewer with planes, slices, annotations, 3D, without an account,
without installing anything, and without leaving your page.

Embedded viewers are **read-only**. Nobody can paint, erase or annotate through
an embed, not even the owner of the data while logged in.

## The short way

One line, anywhere in your page:

```html
<script src="https://brainbox.pasteur.fr/embed.js"
        data-url="http://braincatalogue.org/data/Sloth_bear/MRI-n4.nii.gz"></script>
```

`data-url` is the address of the MRI, exactly as you would paste it into
BrainBox itself. The viewer appears where the script tag is.

That is the whole procedure. Everything below is optional.

## Options

Add them as `data-` attributes on the script tag.

| Attribute | What it does |
|---|---|
| `data-url` | **Required.** URL of the MRI (`.nii.gz` or `.mgz`) |
| `data-view` | Plane to open on: `sag`, `cor` or `axi` |
| `data-slice` | Slice to open on (default: the middle of the volume) |
| `data-project` | Shortname of the project owning the annotation to show |
| `data-annotation` | Name of the annotation layer to show |
| `data-max-height` | Largest height, in pixels, the viewer may take |
| `data-brainbox-link` | `0` to hide the BrainBox button |
| `data-width` | Width of the viewer (default `100%`) |
| `data-max-width` | Largest width it may take (default `560px`) |
| `data-height` | Height to start at, before the volume is measured (default `420px`) |
| `data-target` | CSS selector of an element to put the viewer in, instead of where the tag is |

For example, an axial view of one annotation layer, never taller than 400
pixels:

```html
<script src="https://brainbox.pasteur.fr/embed.js"
        data-url="http://braincatalogue.org/data/Sloth_bear/MRI-n4.nii.gz"
        data-view="axi"
        data-project="braincatalogue"
        data-annotation="Cerebrum"
        data-max-height="400"></script>
```

Several embeds on one page are fine. Each sizes itself independently.

## The viewer

- **Sag / Cor / Axi / 3D** choose what you are looking at. 3D appears in the
  same place as the slices, so nothing opens in a new tab or window.
- The **slider** moves through slices.
- **Full screen** needs `allow="fullscreen"` on the frame; the loader sets it
  for you. Press Escape to leave.
- The **BrainBox** button opens the dataset's own page, at the plane and slice
  the visitor is looking at. Hide it with `data-brainbox-link="0"`.

## Writing the frame yourself

The loader is only a convenience. If you would rather not run our JavaScript,
or you need control of the markup, write the frame directly – the same options
become query parameters:

```html
<iframe src="https://brainbox.pasteur.fr/mri/embed?url=http%3A%2F%2Fexample.org%2Fbrain.nii.gz&view=cor"
        style="width:100%; max-width:560px; height:420px; border:0"
        allow="fullscreen" allowfullscreen></iframe>
```

Remember to URL-encode the `url` parameter.

## Height

An `<iframe>` is sized by *your* page, not by what is inside it, and the right
height depends on which plane is showing – a sagittal view is wider and
shallower than an axial one.

The viewer therefore tells your page the height it needs, whenever that
changes. If you use the script loader this is already handled. If you wrote the
frame yourself and want the same behaviour:

```html
<script>
window.addEventListener('message', function (event) {
    var frame = document.getElementById('my-brain');
    if (event.source !== frame.contentWindow) { return; }          // it must be ours
    if (!event.data || event.data.type !== 'brainbox:embed-resize') { return; }
    frame.style.height = event.data.height + 'px';
});
</script>
```

The message is `{type: 'brainbox:embed-resize', height, width, aspect, view}`.
Always check `event.source` before acting on it, so another page cannot resize
your frame.

**This is optional.** The viewer lays itself out correctly at whatever size it
is given: the controls stay reachable and the dataset is fitted to the space left
over. A fixed-size frame is a perfectly good way to embed.

## Which datasets can be embedded

Any volume that is **publicly viewable** – if it can be seen without logging in,
it can be embedded.

Datasets in private projects cannot be embedded yet: the viewer will report that
the content is private. Embedding private content with a revocable, per-project
link is planned but not built.

## Read-only

The read-only guarantee is enforced by the server, not by hiding buttons. An
embedded viewer's connection is refused write access for the dataset it is
showing, and it cannot ask for a different dataset. This holds regardless
of who is looking at it or what their account can normally do.
