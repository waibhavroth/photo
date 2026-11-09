
const SUPABASE_URL = "https://dvanqiwtfqommdqyczvv.supabase.co";
const SUPABASE_KEY = "sb_publishable_TKs6mv-hT-61wbFM-dnaMQ_2Ksp8EVS";

const db = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_KEY
);

const visitorId = getVisitorId();

function getVisitorId() {
  let id = localStorage.getItem("snapspace_visitor");

  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem("snapspace_visitor", id);
  }

  return id;
}

const feed = document.getElementById("photoFeed");
const uploadForm = document.getElementById("uploadForm");

function element(tag, className, value) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (value !== undefined) el.textContent = value;
  return el;
}

// Upload a photo

uploadForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  e.stopPropagation();

  const author = document.getElementById("authorName").value.trim();
  const caption = document.getElementById("caption").value.trim();
  const file = document.getElementById("photoInput").files[0];

  const status = document.getElementById("uploadStatus");
  const btn = document.getElementById("uploadBtn");

  if (!author || !file) return;

  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
    status.textContent = "Please select a valid image.";
    return;
  }

  if (file.size > 5 * 1024 * 1024) {
    status.textContent = "Image must be smaller than 5 MB.";
    return;
  }

  btn.disabled = true;
  status.textContent = "Uploading photo...";

  try {
    const extension = file.type.split("/")[1];
    const filePath = `${crypto.randomUUID()}.${extension}`;

    // Upload image to Supabase Storage
    const { error: storageError } = await db.storage
      .from("photos")
      .upload(filePath, file, {
        contentType: file.type
      });

    if (storageError) throw storageError;

    const { data: imageData } = db.storage
      .from("photos")
      .getPublicUrl(filePath);

    // Save post details
    const { error: postError } = await db
      .from("posts")
      .insert({
        author_name: author,
        caption: caption,
        image_url: imageData.publicUrl
      });

    if (postError) throw postError;

    // Clear form without reloading
    uploadForm.reset();

    status.textContent = "🎉 Photo uploaded successfully!";

    // Refresh only the photo feed
    await loadPhotos();

  } catch (error) {
    console.error(error);
    status.textContent = "Upload failed: " + error.message;
  } finally {
    btn.disabled = false;
  }
});


// Load all photos
async function loadPhotos() {
  feed.replaceChildren(element("p", "", "Loading photos..."));

  const { data: posts, error } = await db
    .from("posts")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    feed.replaceChildren(
      element("p", "", "Could not load photos: " + error.message)
    );
    return;
  }

  feed.replaceChildren();

  if (!posts || posts.length === 0) {
    feed.append(element("p", "", "No photos yet. Be the first to share! 📸"));
    return;
  }

  for (const post of posts) {
    await createPhotoCard(post);
  }
}

// Create a photo card
async function createPhotoCard(post) {
  const card = element("article", "photo-card");

  const img = document.createElement("img");
  img.src = post.image_url;
  img.alt = "Photo shared by " + post.author_name;
  img.loading = "lazy";

  const info = element("div", "photo-info");

  info.append(element("h3", "", "📷 " + post.author_name));
  info.append(element("p", "caption", post.caption || ""));

  const date = new Date(post.created_at).toLocaleDateString();
  info.append(element("p", "post-date", date));

  // Get like count
  const { count: likeCount, error: likeError } = await db
    .from("likes")
    .select("*", { count: "exact", head: true })
    .eq("post_id", post.id);

  if (likeError) console.error(likeError);

  // Check if current visitor liked it
  const { data: myLike } = await db
    .from("likes")
    .select("id")
    .eq("post_id", post.id)
    .eq("visitor_id", visitorId)
    .maybeSingle();

  const likeBtn = element(
    "button",
    "like-btn" + (myLike ? " liked" : ""),
    `${myLike ? "❤️" : "🤍"} Like (${likeCount || 0})`
  );

  
likeBtn.addEventListener("click", async (e) => {
  e.preventDefault();
  e.stopPropagation();

  likeBtn.disabled = true;

  try {
    if (myLike) {
      const { error } = await db
        .from("likes")
        .delete()
        .eq("id", myLike.id);

      if (error) throw error;

      likeBtn.textContent = `🤍 Like (${Math.max(0, (likeCount || 0) - 1)})`;
      likeBtn.classList.remove("liked");

    } else {
      const { error } = await db
        .from("likes")
        .insert({
          post_id: post.id,
          visitor_id: visitorId
        });

      if (error) throw error;

      likeBtn.textContent = `❤️ Like (${(likeCount || 0) + 1})`;
      likeBtn.classList.add("liked");
    }

  } catch (error) {
    console.error("Like error:", error);
    alert(error.message);
  } finally {
    likeBtn.disabled = false;
  }
});


  info.append(likeBtn);

  // Comments section
  const commentsBox = element("div", "comments");
  commentsBox.append(element("h4", "", "💬 Comments"));

  const { data: comments, error: commentError } = await db
    .from("comments")
    .select("*")
    .eq("post_id", post.id)
    .order("created_at", { ascending: true });

  const commentList = element("div", "comment-list");

  if (commentError) {
    commentList.append(element("p", "", "Could not load comments."));
  } else if (comments.length === 0) {
    commentList.append(element("p", "", "No comments yet."));
  } else {
    comments.forEach(comment => {
      const item = element("p", "comment");
      const author = element("strong", "", comment.author_name + ": ");
      item.append(author);
      item.append(document.createTextNode(comment.content));
      commentList.append(item);
    });
  }

  commentsBox.append(commentList);

  // Add comment form
  const commentForm = element("form", "comment-form");

  const nameInput = document.createElement("input");
  nameInput.placeholder = "Your name";
  nameInput.maxLength = 40;
  nameInput.required = true;

  const commentInput = document.createElement("input");
  commentInput.placeholder = "Write a comment...";
  commentInput.maxLength = 500;
  commentInput.required = true;

  const sendBtn = element("button", "", "Send");

  commentForm.append(nameInput, commentInput, sendBtn);

  commentForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    const name = nameInput.value.trim();
    const content = commentInput.value.trim();

    if (!name || !content) return;

    sendBtn.disabled = true;

    const { error } = await db.from("comments").insert({
      post_id: post.id,
      visitor_id: visitorId,
      author_name: name,
      content: content
    });

    if (error) {
      alert(error.message);
      sendBtn.disabled = false;
      return;
    }

    await loadPhotos();
  });

  commentsBox.append(commentForm);
  info.append(commentsBox);

  card.append(img, info);
  feed.append(card);
}

// Initial load
loadPhotos();
