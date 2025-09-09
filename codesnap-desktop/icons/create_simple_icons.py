from PIL import Image, ImageDraw, ImageFont
import os

def create_icon(size):
    # Create image with transparent background
    img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    
    # Draw gradient background (approximation with rectangle)
    draw.rectangle([0, 0, size, size], fill=(102, 126, 234, 255))
    
    # Draw code symbol
    font_size = max(8, size // 2)
    try:
        # Try to load a font, fallback to default
        font = ImageFont.load_default()
    except:
        font = None
    
    # Draw '<>' symbol in white
    text = "<>"
    if font:
        # Get text size
        bbox = draw.textbbox((0, 0), text, font=font)
        text_width = bbox[2] - bbox[0]
        text_height = bbox[3] - bbox[1]
        
        # Center the text
        x = (size - text_width) // 2
        y = (size - text_height) // 2
        
        draw.text((x, y), text, fill=(255, 255, 255, 255), font=font)
    
    # Save the image
    img.save(f'icon{size}.png')
    print(f"Created icon{size}.png")

# Create all required icon sizes
sizes = [16, 32, 48, 128]
for size in sizes:
    create_icon(size)
